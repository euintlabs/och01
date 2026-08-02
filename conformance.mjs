import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';

const CONTRACT = process.argv[2];
const RPC = process.argv[3] || 'https://octra.network/rpc';
const ZERO = 'oct1111111111111111111111111111111111111111111';
if (!CONTRACT) { console.error('usage: node conformance.mjs <contract_address> [rpc_url]'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const scalar = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? ('result' in v ? v.result : ('value' in v ? v.value : v)) : v;
const str = (v) => v == null ? '' : String(v);
const notFound = (e) => /unknown|not found|no method|undefined function|unknown function|no such/i.test(e || '');

function rpc(method, params) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const lib = RPC.startsWith('https') ? https : http;
    const req = lib.request(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 20000 }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        if (res.statusCode === 429) return resolve({ throttled: true });
        if (res.statusCode >= 500 || /^\s*</.test(out)) return resolve({ transport: 'HTTP ' + res.statusCode });
        try { resolve(JSON.parse(out)); } catch { resolve({ transport: 'bad json' }); }
      });
    });
    req.on('error', (e) => resolve({ transport: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ transport: 'timeout' }); });
    req.end(body);
  });
}

async function call(method, params = [], tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await rpc('contract_call', [CONTRACT, method, params, null]);
    if (r.throttled || r.transport) { await sleep(1200 * (i + 1)); continue; }
    await sleep(280);
    if (r.error) return { reverted: typeof r.error === 'string' ? r.error : (r.error.message || JSON.stringify(r.error)) };
    return { val: scalar(r.result) };
  }
  return { rateLimited: true };
}

async function readAsset(circle, path, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await rpc('octra_circleAsset', [circle, path]);
    if (r.throttled || r.transport) { await sleep(1200 * (i + 1)); continue; }
    await sleep(280);
    const b64 = r.result && (r.result.body_b64 || r.result.content);
    return b64 ? Buffer.from(b64, 'base64').toString('utf8') : null;
  }
  return null;
}

const METHODS = {
  'ownership core (§2.1)': [['transfer', [ZERO, 0]], ['approve', [ZERO, 0]], ['transfer_from', [ZERO, ZERO, 0]], ['owner_of', [0]], ['balance_of', [ZERO]], ['get_approved', [0]], ['token_uri', [0]]],
  'collection info (§2.2)': [['get_name'], ['get_symbol'], ['get_decimals'], ['get_total_supply'], ['get_max_supply'], ['get_next_id'], ['get_max_per_wallet'], ['get_owner']],
  'living / circle (§2.3)': [['seed_of', [0]], ['get_renderer_circle'], ['get_metadata_circle']],
  'provenance (§2.4)': [['get_provenance'], ['is_provenance_locked']],
  'mint / economics (§2.5)': [['mint'], ['get_mint_price'], ['is_mint_price_locked'], ['minted_by_wallet', [ZERO]], ['mint_epoch_of_token', [0]], ['get_proceeds']],
  'royalty (§2.6)': [['royalty_info', [0, 1000000]], ['royalty_of', [0]], ['creator_of', [0]], ['get_royalty_recip'], ['get_royalty_bps']],
  'admin (§2.7)': [['set_renderer_circle', [ZERO]], ['set_metadata_circle', [ZERO]], ['set_provenance', ['x']], ['lock_provenance'], ['set_mint_price', [0]], ['lock_mint_price'], ['set_royalty_recip', [ZERO]], ['sweep_proceeds', [0, ZERO]], ['transfer_ownership', [ZERO]]],
  'cross-contract mirrors (§2.8)': [['owner_of_call', [0]], ['balance_of_call', [ZERO]], ['seed_of_call', [0]], ['get_total_supply_call']],
};

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };
let pass = 0, fail = 0, warn = 0;
const P = (ok, label, detail) => { console.log('  ' + (ok ? C.g + 'PASS' : C.r + 'FAIL') + C.x + ' ' + label + (detail ? '  ' + C.d + detail + C.x : '')); ok ? pass++ : fail++; };
const W = (label, detail) => { console.log('  ' + C.y + 'WARN' + C.x + ' ' + label + (detail ? '  ' + C.d + detail + C.x : '')); warn++; };

async function run() {
  console.log('\nOCH-01 conformance — ' + CONTRACT + '\nrpc ' + RPC + '\n');
  console.log('§2 contract interface (method presence)');
  for (const [group, list] of Object.entries(METHODS)) {
    for (const [m, params] of list) {
      const r = await call(m, params || []);
      if (r.rateLimited) { W(m, 'rate-limited, could not verify'); continue; }
      if (r.val !== undefined) { P(true, m); continue; }
      if (r.reverted && !notFound(r.reverted)) { P(true, m, 'reverts (exists)'); continue; }
      P(false, m, r.reverted || 'absent');
    }
    console.log('  ' + C.d + '— ' + group + C.x);
  }

  console.log('\n§2.9 optional living-clock');
  const gi = await call('genesis_info');
  if (gi.rateLimited) W('genesis_info', 'rate-limited');
  else if (gi.val !== undefined || (gi.reverted && !notFound(gi.reverted))) W('genesis_info present', 'render_type should be "living-clock"');
  else console.log('  ' + C.d + '—  genesis_info absent, render_type "living"' + C.x);

  console.log('\nvalue sanity (view getters)');
  const g = async (m, p = []) => (await call(m, p)).val;
  const name = str(await g('get_name')), sym = str(await g('get_symbol'));
  const supply = Number(await g('get_total_supply')), maxS = Number(await g('get_max_supply'));
  const nextId = Number(await g('get_next_id')), price = await g('get_mint_price');
  const rc = str(await g('get_renderer_circle')), mc = str(await g('get_metadata_circle'));
  const prov = str(await g('get_provenance')), provLock = Number(await g('is_provenance_locked'));
  const seed0 = str(await g('seed_of', [0]));
  P(!!name, 'get_name', name); P(!!sym, 'get_symbol', sym);
  P(Number.isFinite(supply) && Number.isFinite(maxS) && supply <= maxS, 'total_supply ≤ max_supply', supply + ' / ' + maxS);
  P(Number.isFinite(nextId), 'get_next_id numeric', str(nextId));
  P(Number(price) > 0, 'get_mint_price > 0 (live)', str(price));
  P(/^oct/.test(rc), 'renderer_circle is an address', rc);
  P(/^oct/.test(mc), 'metadata_circle is an address', mc);
  P(prov.length >= 32, 'provenance set', prov ? prov.slice(0, 16) + '…' : '(empty)');
  P(provLock === 1, 'provenance locked', provLock === 1 ? 'immutable' : 'not locked');

  console.log('\ncircle assets');
  const idx = /^oct/.test(rc) ? await readAsset(rc, '/index.html') : null;
  P(!!idx, 'renderer /index.html readable', idx ? idx.length + ' bytes' : 'unreadable');
  if (idx) P(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|src\s*=\s*["']https?:|href\s*=\s*["']https?:/.test(idx), 'renderer self-contained');

  let col = null;
  try { col = JSON.parse(await readAsset(mc, '/collection.json')); } catch { col = null; }
  P(!!col, 'collection.json readable + valid');
  if (col) {
    P(['name', 'symbol', 'max_supply', 'render_type', 'contract_address', 'renderer_circle', 'metadata_circle'].every((k) => k in col), 'collection.json required fields');
    P(col.contract_address === CONTRACT, 'collection.json contract matches', str(col.contract_address));
  }
  let tr = null;
  try { tr = JSON.parse(await readAsset(mc, '/traits.json')); } catch { tr = null; }
  P(!!tr && Array.isArray(tr.tokens), 'traits.json readable + valid');
  let tok = null;
  try { tok = JSON.parse(await readAsset(mc, '/0.json')); } catch { tok = null; }
  P(!!tok, 'token /0.json readable + valid');
  if (tok) P(['name', 'image', 'animation_url', 'attributes'].every((k) => k in tok), '0.json required fields');

  console.log('\nseed determinism (§3)');
  const salt = tr && tr.seedSalt;
  if (salt && seed0) {
    P(seed0 === sha256(salt + ':0'), 'seed_of(0) == sha256(salt:0)', salt);
    if (tr.tokens && tr.tokens[0]) P(tr.tokens[0].seed === seed0, 'traits.json seed matches on-chain');
  } else {
    W('seed check skipped', 'need traits.seedSalt + seed_of(0)');
  }

  console.log('\n' + '─'.repeat(50));
  console.log(pass + ' pass · ' + fail + ' fail · ' + warn + ' warn');
  if (warn && !fail) console.log(C.y + 'inconclusive: rate-limited, re-run against a less-limited RPC' + C.x);
  console.log(fail === 0 ? C.g + 'OCH-01 CONFORMANT' + C.x : C.r + 'NOT conformant, see FAILs' + C.x);
  process.exit(fail === 0 ? 0 : 1);
}

run();
