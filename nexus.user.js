// ==UserScript==
// @name         nexus_
// @namespace    by_jass
// @version      5.0
// @description  nexus_ ticket selector - by_jass
// @match        *://*/*
// @match        https://www.ticketmaster.com/*
// @match        https://www.ticketmaster.ca/*
// @match        https://www.ticketmaster.co.uk/*
// @match        https://www.ticketmaster.com.au/*
// @match        https://www.ticketmaster.de/*
// @match        https://www.ticketmaster.fr/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// ==/UserScript==
(function () {
  'use strict';

  if (!/ticketmaster/i.test(location.hostname)) return;

  const CLICK_DELAY = 0;
  const COOLDOWN = 200;
  const ERR_COOLDOWN = 40;
  const RESALE_RE = /(re-?sale|resold|fan[- ]to[- ]fan)/i;
  const BLOCK_RE = /(v\.?i\.?p|platinum|premium)/i;
  const RESERVE_SELECTOR = 'button.indexstyles__StyledButton-sc-83qv1q-0.gEflqA';
  const TICK = 30;
  const MIN_GAP_READY = 8;
  const MIN_GAP_LOADING = 35;
  const DEBUG = false;
  const SIREN_SECS = 3;
  const SIREN_IGNORES_MUTE = true;
  const PEND_TTL = 180000;
  const DONE_RE = /checkout|\/as\/authorization|\/cart\b|\/purchase/i;

  const MAP_ENABLED = true;
  const SEAT_MIN = 5, SEAT_MAX = 70;
  const MAX_SEATS = 8;
  const HOLD_MS = 15000;

  const TYPES = ['Standard Admission','General Admission','Grounds','Standard Tickets','General Admission (GA)','Reserved Seating','LAWN','PIT','PORCH','GA Left','GA Right','Accessible Seating','Wheelchair Accessible','Wheelchair Seating','Accessible / ADA Tickets','Official Platinum Tickets','VIP Tickets','VIP Packages','Premium Tickets','Premium Seating','Artist Presale','Artist Preferred Tickets','Fan Club Presale','Venue Presale','Venue Preferred Tickets','Live Nation Presale','Ticketmaster Presale','Promoter Presale','Radio Presale','Sponsor Presale','Partner Presale','Citi Cardmember Presale','Citi Cardmember Preferred Tickets','Chase Cardholder Presale','Chase Cardholder Preferred Tickets','Amex Cardmember Presale','Amex Cardmember Preferred Tickets','Verizon Presale','Verizon Preferred Tickets','Spotify Presale','Spotify Preferred Tickets','Ticketmaster Verified Fan Presale','Local Presale','Newsletter Presale','Presale Tickets','Presale Code Tickets','Companion Tickets','Group Tickets','Group of 2','Group of 3','Group of 4','Standing Room Only (SRO)','Lawn Tickets','Floor Tickets','Pit Tickets','Front Row Tickets','Club Tickets','Suite Tickets','Box Seats','Early Entry Tickets','Student Tickets','Military Tickets','Family Tickets','Senior Tickets','Season Tickets','Mobile Tickets','Digital Tickets'];

  const DEFAULTS = { type: 'all', section: 'all', row: 'all', seat: 'all', price: 'all', qty: '2' };
  const FIELDS = [
    ['type', 'ticket_type', 'all'],
    ['section', 'section', 'all'],
    ['row', 'row', 'all'],
    ['seat', 'seat_number', 'all'],
    ['price', 'price', 'all'],
    ['qty', 'quantity', '2']
  ];

  let S = Object.assign({}, DEFAULTS);
  let on = false;
  let shown = false;
  let minimized = false;
  let pendingTs = 0;
  let doneAt = 0;
  let completed = false;
  const INST = Math.random().toString(36).slice(2);
  const newId = () => Math.random().toString(36).slice(2, 10);

  const PEND_KEY = 'nexus_pend';
  const getPend = () => { try { return JSON.parse(GM_getValue(PEND_KEY, '{}')) || {}; } catch (e) { return {}; } };
  const setPend = o => { try { GM_setValue(PEND_KEY, JSON.stringify(o)); } catch (e) {} };

  let TAB = null;
  try { const m = String(window.name).match(/^nexus_tab:(\w+)/); if (m) TAB = m[1]; } catch (e) {}
  if (!TAB) { try { TAB = sessionStorage.getItem('nexus_tab_id'); } catch (e) {} }
  if (TAB) {
    try { const hb = JSON.parse(GM_getValue('nexus_hb_' + TAB, 'null')); if (hb && hb.inst !== INST && hb.ts > 0 && Date.now() - hb.ts < 1300) TAB = null; } catch (e) {}
  }
  if (!TAB && DONE_RE.test(location.href)) {

    try {
      const p = getPend(); let best = null;
      for (const id in p) {
        if (Date.now() - p[id] > PEND_TTL) continue;
        const hb = JSON.parse(GM_getValue('nexus_hb_' + id, 'null'));
        if (hb && hb.ts > 0 && Date.now() - hb.ts < 800) continue;
        if (!best || p[id] > p[best]) best = id;
      }
      if (best) TAB = best;
    } catch (e) {}
  }
  const freshTab = !TAB;
  if (!TAB) TAB = newId();
  try { sessionStorage.setItem('nexus_tab_id', TAB); } catch (e) {}
  try { if (!window.name || /^nexus_tab:/.test(window.name)) window.name = 'nexus_tab:' + TAB; } catch (e) {}
  if (!freshTab) {
    try {
      const saved = JSON.parse(GM_getValue('nexus_tab_' + TAB, 'null'));
      if (saved) {
        S = Object.assign({}, DEFAULTS, saved.S); on = !!saved.on; pendingTs = saved.pend || 0; doneAt = saved.doneAt || 0;
        shown = !!saved.shown; minimized = !!saved.min;
      }
    } catch (e) {}
  }
  if (doneAt && DONE_RE.test(location.href)) completed = true;
  const beat = ts => { try { GM_setValue('nexus_hb_' + TAB, JSON.stringify({ inst: INST, ts })); } catch (e) {} };
  beat(Date.now()); setInterval(() => beat(Date.now()), 1000);
  const persistTab = () => { try { GM_setValue('nexus_tab_' + TAB, JSON.stringify({ S, on, pend: pendingTs, doneAt, shown, min: minimized })); } catch (e) {} };
  addEventListener('pagehide', () => { persistTab(); beat(0); });
  addEventListener('beforeunload', () => { persistTab(); beat(0); });
  persistTab();
  function markPending() { const p = getPend(); p[TAB] = Date.now(); setPend(p); }
  function clearPending() { const p = getPend(); delete p[TAB]; setPend(p); }

  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const isAll = s => !norm(s) || norm(s) === 'all';
  const split = s => norm(s).split(/[,;\s]+/).filter(Boolean);
  const num = t => (/^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null);
  const alphaCmp = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
  function cmpTok(a, b) {
    const na = num(a), nb = num(b);
    if (na !== null && nb !== null) return na - nb;
    if (na === null && nb === null) return alphaCmp(a, b);
    return NaN;
  }

  function matchTok(val, spec) {
    val = norm(val);
    for (const t of split(spec)) {
      let m;
      if (val === t) return true;
      if ((m = t.match(/^-(.+)$/))) { if (cmpTok(val, m[1]) <= 0) return true; }
      else if ((m = t.match(/^(.+?)-(.+)$/))) { if (cmpTok(val, m[1]) >= 0 && cmpTok(val, m[2]) <= 0) return true; }
    }
    return false;
  }

  function secMatch(val, spec) {
    val = norm(val);
    const n = num(val);
    for (const t of split(spec)) {
      let m;
      if ((m = t.match(/^-(\d+)$/))) {
        const line = Math.floor(parseFloat(m[1]) / 100);
        if (n !== null) { if (Math.floor(n / 100) <= line) return true; }
        else if (/^(pit|floor|ground)/.test(val)) return true;
      } else if (matchTok(val, t)) return true;
    }
    return false;
  }
  function qtyList(spec) {
    const out = new Set();
    for (const t of split(spec)) {
      let m;
      if ((m = t.match(/^-(\d+)$/))) { for (let i = 1; i <= +m[1]; i++) out.add(i); }
      else if ((m = t.match(/^(\d+)-(\d+)$/))) { for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
      else if (/^\d+$/.test(t)) out.add(+t);
    }
    if (!out.size) out.add(2);
    return [...out].sort((a, b) => b - a);
  }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    } catch (e) { return false; }
  }
  const enabled = el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const accWanted = () => /access|wheelchair|\bada\b/.test(norm(S.type));
  const nonAccWanted = () => isAll(S.type) || norm(S.type).split(',').some(t => t.trim() && !/access|wheelchair|\bada\b/.test(t));

  function pageState() {
    const u = location.href.toLowerCase();
    if (DONE_RE.test(u)) return 'done';
    if (!/ticketmaster/.test(u) || !/(event|queue)/.test(u)) return 'unknown';
    return 'ok';
  }

  function parseListing(el) {
    const text = el.innerText || '';
    const low = text.toLowerCase();
    const sec = (text.match(/\bsec(?:tion)?\b\.?\s*([a-z0-9]+)/i) || text.match(/\b(pit|lawn|floor|grounds?|ga\s?\w*)\b/i) || [])[1];
    const row = (text.match(/\brow\b\.?\s*([a-z0-9]+)/i) || [])[1];
    const sm = text.match(/\bseats?\b\.?\s*(\d+)(?:\s*[-\u2013]\s*(\d+))?/i);
    const prices = [...text.matchAll(/[$£€]\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1].replace(/,/g, '')));
    const qm = text.match(/\(x\s*(\d+)\)|\b(\d+)\s*tickets?\b/i);
    return {
      low, sec: sec ? sec.toLowerCase() : null, row: row ? row.toLowerCase() : null,
      seatLo: sm ? +sm[1] : null, seatHi: sm ? +(sm[2] || sm[1]) : null,
      prices, qty: qm ? +(qm[1] || qm[2]) : null
    };
  }
  function typeOk(low) {
    if (isAll(S.type)) return true;
    return norm(S.type).split(',').map(s => s.trim()).filter(Boolean).some(t => {
      const bare = t.replace(/\(.*?\)/g, '').trim();
      const inner = (t.match(/\((.*?)\)/) || [])[1];
      return low.includes(t) || (bare && low.includes(bare)) || (inner && new RegExp('\\b' + inner + '\\b').test(low));
    });
  }

  const HAS_PRICE = /[$£€]\s*\d/;
  const PRICE_RE = /(?:[A-Z]{1,3})?[$£€]\s*[\d,]+(?:[.,]\d{1,2})?/g;
  const priceCount = t => (t.match(PRICE_RE) || []).length;
  const CLS_RESALE = /(^|[^a-z])resale|resold|verified[-_]?resale/;
  const ATTRS = ['aria-label', 'title', 'alt', 'data-bdd', 'data-testid', 'data-test', 'id'];
  function attrText(root) {
    let attrs = '', cls = '';
    const list = [root].concat([...root.querySelectorAll('*')].slice(0, 200));
    for (const n of list) {
      for (const a of ATTRS) { const v = n.getAttribute(a); if (v) attrs += ' ' + v; }
      const c = n.getAttribute('class'); if (c) cls += ' ' + c;
    }
    return { attrs: attrs.toLowerCase(), cls: cls.toLowerCase() };
  }
  function headerReason(row) {
    let el = row;
    for (let lvl = 0; lvl < 4 && el && el !== document.body; lvl++, el = el.parentElement) {
      for (let sib = el.previousElementSibling, hops = 0; sib && hops < 40; sib = sib.previousElementSibling, hops++) {
        const t = (sib.innerText || '').trim();
        if (!t || HAS_PRICE.test(t) || t.length > 80) continue;
        const low = t.toLowerCase();
        if (RESALE_RE.test(low)) return 'resale';
        if (BLOCK_RE.test(low)) return 'vip_platinum_premium';
        return '';
      }
    }
    return '';
  }
  const brCache = new WeakMap();
  function blockedReason(el, fresh) {
    const now = Date.now(), c = brCache.get(el);
    if (!fresh && c && now - c.ts < 400) return c.r;
    let blk = el; const n = priceCount(el.innerText || '');
    for (let i = 0; i < 4; i++) {
      const p = blk.parentElement;
      if (!p || p === document.body) break;
      const t = p.innerText || '';
      if (t.length > 500 || priceCount(t) !== n) break;
      blk = p;
    }
    const txt = ((blk.innerText || '') + ' ' + (blk.textContent || '')).toLowerCase();
    const at = attrText(blk);
    let r = '';
    if (RESALE_RE.test(txt) || RESALE_RE.test(at.attrs) || CLS_RESALE.test(at.cls)) r = 'resale';
    else if (BLOCK_RE.test(txt) || BLOCK_RE.test(at.attrs)) r = 'vip_platinum_premium';
    else r = headerReason(blk);
    brCache.set(el, { ts: now, r });
    return r;
  }
  function reject(el, info) {
    const bl = blockedReason(el, false);
    if (bl) return bl;
    if (!typeOk(info.low)) return 'type';
    if (!isAll(S.section)) {
      const cands = info.sec ? [info.sec] : (info.low.match(/[a-z0-9]+/g) || []);
      if (!cands.some(v => secMatch(v, S.section))) return 'section';
    }
    if (!isAll(S.row)) { if (!info.row || !matchTok(info.row, S.row)) return 'row'; }
    if (!isAll(S.seat) && info.seatLo !== null) {
      let hit = 0;
      for (let q = info.seatLo; q <= info.seatHi; q++) if (matchTok(String(q), S.seat)) hit++;
      if (!hit) return 'seat';
    }
    if (!isAll(S.price)) {
      if (!info.prices.some(p => matchTok(String(p), S.price) || matchTok(String(Math.round(p)), S.price))) return 'price';
    }
    return '';
  }

  let leAt = 0, leCache = [];
  function listingEls() {
    const now = Date.now();
    if (now - leAt < 90) return leCache.filter(e => e.isConnected);
    leAt = now;
    const rows = new Set(), seenP = new Set();
    const rootEl = document.body || document.documentElement;
    if (!rootEl) return [];
    const tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let n, count = 0;
    while ((n = tw.nextNode())) {
      if (++count > 30000) break;
      const v = n.nodeValue;
      if (!v || v.length > 30 || !/^\s*[A-Za-z]{0,3}[$£€]\s*\d/.test(v)) continue;
      const el = n.parentElement;
      if (!el || el.children.length || seenP.has(el) || el instanceof SVGElement) continue;
      seenP.add(el);
      let p = el.parentElement, d = 0;
      while (p && p !== document.body && d < 8) {
        const t = p.innerText || '';
        if (t.length > 400) break;
        if ((t.match(PRICE_RE) || []).length > 2) break;
        if (t.replace(PRICE_RE, '').replace(/[^a-z]/gi, '').length >= 6) {
          if (!p.querySelector('input,select,textarea,[role="slider"],[role="listbox"]') && visible(p)) rows.add(p);
          break;
        }
        p = p.parentElement; d++;
      }
    }
    leCache = [...rows];
    return leCache;
  }

  const MAX_TRIES = 2, BAN_MS = 2500;
  const attempts = new Map(), announced = new Set();
  function banned(key) {
    const a = attempts.get(key);
    if (!a) return false;
    if (Date.now() - a.ts > BAN_MS) { attempts.delete(key); announced.delete(key); return false; }
    return a.n >= MAX_TRIES;
  }
  function noteTry(key) { const a = attempts.get(key) || { n: 0, ts: 0 }; a.n++; a.ts = Date.now(); attempts.set(key, a); }
  function clearAttempts() { attempts.clear(); announced.clear(); verdicts.clear(); }
  function checkBan(key) {
    if (!banned(key)) return false;
    if (!announced.has(key)) { announced.add(key); emit('ban'); }
    return true;
  }

  const REASON_TAG = { resale: 'resale_guard', type: 'type_match', vip_platinum_premium: 'type_match', section: 'sec_parse', row: 'row_parse', seat: 'seat_parse', price: 'price_range', retry_limit: 'retry_guard' };
  const verdicts = new Map();
  let lastDbg = 0, lastPool = '';
  function bestCandidate() {
    const wanted = qtyList(S.qty);
    let best = null, bestRank = 1e9, seen = 0, okN = 0;
    const dbg = [];
    for (const el of listingEls()) {
      if (!visible(el)) continue;
      seen++;
      const info = parseListing(el);
      let why = reject(el, info), rank = 0;
      if (!why) {
        if (info.qty === null) rank = wanted.length;
        else { rank = wanted.indexOf(info.qty); if (rank < 0) why = 'qty_' + info.qty; }
      }
      const key = 'L|' + [info.sec, info.row, info.prices[0], info.qty].join('|');
      if (!why && checkBan(key)) why = 'retry_limit';
      const label = ((el.innerText || '').split('\n')[0] || '').trim().slice(0, 22) + ' $' + (info.prices[0] || '?');
      const verdict = why || 'ok';
      if (verdicts.get(key) !== verdict) {
        if (verdicts.size > 300) verdicts.clear();
        verdicts.set(key, verdict);
        log(why ? (why.indexOf('qty_') === 0 ? 'qty_rank' : (REASON_TAG[why] || 'pool')) : 'pool', label + ' -> ' + verdict, why ? 'scan' : 'hit');
      }
      if (!why) okN++;
      if (DEBUG) dbg.push({ sec: info.sec, row: info.row, price: info.prices.join('/'), qty: info.qty, result: verdict });
      if (!why && rank < bestRank) { best = { el, info, key, label }; bestRank = rank; }
    }
    const pool = seen + '/' + okN;
    if (pool !== lastPool) { lastPool = pool; log('pool', 'rows=' + seen + '_ok=' + okN, 'cfg'); }
    if (!seen) hb('list_scan', 'waiting_for_rows');
    if (DEBUG && dbg.length && Date.now() - lastDbg > 4000) {
      lastDbg = Date.now();
      console.log('[nexus_] listings seen, filters:', JSON.stringify(S));
      console.table(dbg);
    }
    return best;
  }

  function parseRGB(s) {
    const m = String(s || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i);
    if (!m) return null;
    let a = 1;
    if (m[4] !== undefined) a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  function toHSL(c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }
  function colorClass(c) {
    if (!c || c.a < 0.12) return 'none';
    const { h, s, l } = toHSL(c);
    if (s < 0.15 || l > 0.93 || l < 0.06) return 'grey';
    if (h >= 95 && h <= 170) return 'green';
    if (h >= 195 && h <= 255 && l >= 0.2 && l <= 0.86) return 'blue';
    if (h < 22 || h >= 335) return 'red';
    if (h >= 28 && h < 70) return 'gold';
    return 'other';
  }
  const colCache = new WeakMap();
  function elColorFull(el) {
    const par = el.parentNode && el.parentNode.getAttribute ? (el.parentNode.getAttribute('class') || '') : '';
    const sig = (el.getAttribute('class') || '') + '|' + (el.getAttribute('fill') || '') + '|' + (el.getAttribute('style') || '') + '|' + par;
    const c = colCache.get(el);
    if (c && c.sig === sig) return c;
    let k = 'none';
    try {
      const cs = getComputedStyle(el);
      k = colorClass(parseRGB(el instanceof SVGElement ? cs.fill : cs.backgroundColor));
    } catch (e) {}
    const e = { sig, k, base: c ? c.base : k };
    colCache.set(el, e);
    return e;
  }
  const elColor = el => elColorFull(el).k;

  let svgAt = 0, svgCache = [];
  function mapSvgs() {
    const now = Date.now();
    if (now - svgAt < 400) return svgCache.filter(s => s.isConnected);
    svgAt = now;
    const out = [];
    for (const s of document.getElementsByTagName('svg')) {
      try {
        const r = s.getBoundingClientRect();
        if (r.width > 250 && r.height > 180 && s.childElementCount > 0) out.push(s);
      } catch (e) {}
    }
    svgCache = out;
    return out;
  }
  function collectSeats(svg) {
    const out = [];
    for (const el of svg.querySelectorAll('circle,ellipse,[data-component*="seat" i]')) {
      if (el.tagName.toLowerCase() === 'g' && el.querySelector('circle')) continue;
      out.push(el);
    }
    return out;
  }

  function nodeInfoText(el, svg) {
    let s = '', n = el;
    for (let i = 0; n && n !== svg && i < 4; i++, n = n.parentElement) {
      for (const a of n.attributes) s += ' ' + a.name + '=' + a.value;
      const t = n.querySelector && n.querySelector(':scope > title'); if (t) s += ' ' + t.textContent;
    }
    return s.toLowerCase();
  }
  const siCache = new WeakMap();
  function seatInfo(el, svg) {
    let c = siCache.get(el);
    if (c) return c;
    const raw = nodeInfoText(el, svg);
    let sec = null, row = null, seat = null, txt = raw;
    for (const m of raw.matchAll(/(?:^|\s)([a-z-]*(?:sect|row|seat)[a-z-]*)=([^\s]{1,12})(?=\s|$)/g)) {
      const name = m[1], v = m[2];
      if (/sect/.test(name) && !sec) sec = v;
      else if (/row/.test(name) && !row) row = v;
      else if (/seat/.test(name) && /^\d+$/.test(v) && seat === null) seat = +v;
    }
    const mm = raw.match(/\bsec(?:tion)?[\s_:-]*([a-z0-9]+)/); if (!sec && mm) sec = mm[1];
    const rr = raw.match(/\brow[\s_:-]*([a-z0-9]+)/); if (!row && rr) row = rr[1];
    const ss = raw.match(/\bseat[\s_:-]*(\d+)/); if (seat === null && ss) seat = +ss[1];
    c = { sec, row, seat, txt, attrAcc: /access|wheelchair|\bada\b/.test(raw) };
    siCache.set(el, c);
    return c;
  }
  function iconish(el) {
    const p = el.parentElement;
    return !!(p && p.tagName.toLowerCase() === 'g' && p.querySelector(':scope > path, :scope > use, :scope > image, :scope > svg, :scope > text'));
  }
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

  let lastSec = '';
  let lastSecClick = { key: '', ts: 0 };
  let seatViewEmptyAt = 0;

  function takeFor(L, q) {
    if (L < q) return 0;
    let t = q;
    if (L - t === 1) t = L;
    return t <= MAX_SEATS ? t : 0;
  }

  function seatCandidate(svg, seatEls, wanted) {
    let blueN = 0;
    for (const el of seatEls) if (elColor(el) === 'blue') blueN++;
    if (!blueN) return null;
    const seats = [];
    for (const el of seatEls) {
      let r; try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (r.width < SEAT_MIN || r.width > SEAT_MAX || r.height < SEAT_MIN || r.height > SEAT_MAX) continue;
      seats.push({ el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, k: elColor(el) });
    }
    if (seats.length < 4) return null;
    const ic = seats.map(s => iconish(s.el)), icRatio = ic.filter(Boolean).length / seats.length;
    const okType = { acc: accWanted(), non: nonAccWanted() };
    seats.forEach((s, i) => {
      s.info = seatInfo(s.el, svg);
      s.acc = s.info.attrAcc || (ic[i] && icRatio < 0.4);
      let ok = s.k === 'blue';
      if (ok && (RESALE_RE.test(s.info.txt) || BLOCK_RE.test(s.info.txt) || CLS_RESALE.test(s.info.txt))) ok = false;
      if (ok) ok = s.acc ? okType.acc : okType.non;
      if (ok && !isAll(S.section)) { const sc = s.info.sec || lastSec; if (sc && !secMatch(sc, S.section)) ok = false; }
      if (ok && !isAll(S.row) && s.info.row && !matchTok(s.info.row, S.row)) ok = false;
      if (ok && !isAll(S.seat) && s.info.seat !== null && !matchTok(String(s.info.seat), S.seat)) ok = false;
      s.ok = ok;
    });

    const sample = seats.slice(0, 80), nn = [];
    for (const a of sample) {
      let m = 1e9;
      for (const b of seats) { if (a === b) continue; const d = Math.hypot(a.cx - b.cx, a.cy - b.cy); if (d < m) m = d; }
      if (m < 1e9) nn.push(m);
    }
    const sp = median(nn) || 30, adj = sp * 1.7;

    const labelled = seats.filter(s => s.info.row && s.info.seat !== null).length >= seats.length * 0.8;
    const groups = new Map();
    if (labelled) {
      for (const s of seats) { const g = (s.info.sec || '') + '|' + s.info.row; (groups.get(g) || groups.set(g, []).get(g)).push(s); }
      for (const g of groups.values()) g.sort((a, b) => a.info.seat - b.info.seat);
    } else {
      const byY = seats.slice().sort((a, b) => a.cy - b.cy);
      let cur = [], cy = null, idx = 0;
      const flush = () => { if (cur.length) { cur.sort((a, b) => a.cx - b.cx); groups.set('r' + (idx++), cur); } cur = []; };
      for (const s of byY) {
        if (cy !== null && Math.abs(s.cy - cy) > s.w * 0.55) { flush(); cy = null; }
        if (cy === null) cy = s.cy;
        cur.push(s);
      }
      flush();
    }

    const runs = [];
    for (const g of groups.values()) {
      let run = [], prev = null;
      for (const s of g) {
        const near = prev && Math.hypot(prev.cx - s.cx, prev.cy - s.cy) <= adj;
        if (s.ok && (!prev || near) && (run.length === 0 || (prev && prev.ok))) run.push(s);
        else { if (run.length) runs.push(run); run = s.ok ? [s] : []; }
        prev = s;
      }
      if (run.length) runs.push(run);
    }
    let best = null, bestScore = 1e9;
    for (const run of runs) {
      for (let i = 0; i < wanted.length; i++) {
        const t = takeFor(run.length, wanted[i]);
        if (!t) continue;
        const score = i * 100 + Math.min(run.length - t, 99);
        if (score < bestScore) { bestScore = score; best = { run, t, q: wanted[i] }; }
        break;
      }
    }
    if (!best) return null;
    const pick = best.run.slice(0, best.t);
    const f = pick[0];
    const key = 'M|' + (f.info.sec || lastSec || '') + '|' + (f.info.row || Math.round(f.cy / 10)) + '|' + (f.info.seat !== null ? f.info.seat : Math.round(f.cx / 10)) + '|' + pick.length;
    const label = 'seats_x' + pick.length + (f.info.row ? '_row_' + f.info.row : '') + (pick.some(s => s.acc) ? '_wc' : '');
    return { kind: 'seats', seats: pick, key, label, q: best.q };
  }

  function secName(el, svg) {
    let n = el;
    for (let i = 0; n && n !== svg && i < 4; i++, n = n.parentElement) {
      for (const a of ['data-section-name', 'data-section', 'data-name', 'data-section-id', 'aria-label', 'id']) {
        const v = n.getAttribute && n.getAttribute(a);
        if (v && v.length < 40) return v.toLowerCase();
      }
      const t = n.querySelector && n.querySelector(':scope > title'); if (t && t.textContent) return t.textContent.trim().toLowerCase();
    }
    return '';
  }
  function sectionCandidate(svg) {
    const els = svg.querySelectorAll('path,polygon,rect,[data-component*="section" i]');
    const sr = svg.getBoundingClientRect(), svgArea = sr.width * sr.height;
    let n = 0;
    for (const el of els) {
      if (++n > 4000) break;
      const e = elColorFull(el);
      const avail = e.k === 'blue' || (e.base === 'grey' && !/^(grey|none|red|gold|green)$/.test(e.k));
      if (!avail) continue;
      let r; try { r = el.getBoundingClientRect(); } catch (x) { continue; }
      if (r.width < 12 || r.height < 12 || r.width * r.height > svgArea * 0.8) continue;
      const info = nodeInfoText(el, svg);
      if (RESALE_RE.test(info) || BLOCK_RE.test(info) || CLS_RESALE.test(info)) continue;
      const name = secName(el, svg);
      if (!isAll(S.section)) {
        const toks = (name.match(/[a-z0-9]+/g) || []).filter(t => !/^(sec|sect|section)$/.test(t));
        if (!toks.some(t => secMatch(t, S.section))) continue;
      }
      const key = 'S|' + (name || Math.round((r.left + r.width / 2) / 8) + '_' + Math.round((r.top + r.height / 2) / 8));
      if (checkBan(key)) continue;
      return { kind: 'section', el, name, key, label: 'sec_' + (name || '?') };
    }
    return null;
  }
  function mapCandidate() {
    const svgs = mapSvgs();
    if (!svgs.length) return null;
    const wanted = qtyList(S.qty);
    for (const svg of svgs) {
      const seatEls = collectSeats(svg);
      if (seatEls.length >= 8) {
        const r = seatCandidate(svg, seatEls, wanted);
        if (r) { if (!checkBan(r.key)) return r; }
        else seatViewEmptyAt = seatViewEmptyAt || Date.now();
        continue;
      }
      seatViewEmptyAt = 0;
      const s = sectionCandidate(svg);
      if (s) return s;
    }
    return null;
  }
  function fire(el) {
    let x = 0, y = 0;
    try { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; } catch (e) {}
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) {}
    el.dispatchEvent(new MouseEvent('mousedown', o));
    o.buttons = 0;
    try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (e) {}
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }
  function anySelected() {
    for (const svg of mapSvgs()) for (const el of collectSeats(svg)) if (elColor(el) === 'green') return true;
    return false;
  }
  let lastReset = 0, mapAt = 0;
  function resetMap() {
    if (Date.now() - lastReset < 2500) return false;
    for (const b of document.querySelectorAll('button,[role="button"]')) {
      const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-bdd') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      if (/(reset|zoom[-_ ]?out|back to map|full map)/.test(t) && visible(b) && enabled(b)) { lastReset = Date.now(); b.click(); log('map', 'zoom_reset', 'scan'); return true; }
    }
    return false;
  }

  const DLG_SEL = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],[class*="odal"],[class*="Dialog"],[class*="Popup"]';
  const BTN_PRIO = [/^agree\s*(&|and)\s*continue$/, /^agree$/, /^continue$/, /^(ok|okay|got it)$/, /^submit$/, /^(accept|yes|done)$/, /^(try again|dismiss|close|x|×)$/];
  const SKIP_DLG = /sign in|log in|password|captcha|verification code|card number|cvv|are you human/;
  let lastPop = 0, mapHold = false;
  function handlePopups() {
    if (Date.now() - lastPop < 60) return false;
    const dlgs = document.querySelectorAll(DLG_SEL);
    if (!dlgs.length) return false;
    for (const dlg of dlgs) {
      if (!visible(dlg)) continue;
      const dt = norm(dlg.innerText);
      if (!dt || SKIP_DLG.test(dt)) continue;
      const isError = /sorry|went wrong|not available|unavailable|no longer|try again|error|couldn.t|unable|expired|sold out|something happened|single seat|left open|leave|one or more|seats? (are|is)/.test(dt);
      let best = null, bestP = 99;
      for (const b of dlg.querySelectorAll('button,[role="button"],a[role="button"]')) {
        if (!visible(b)) continue;
        const bt = norm(b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ');
        for (let i = 0; i < BTN_PRIO.length; i++) if (BTN_PRIO[i].test(bt) && i < bestP) { best = b; bestP = i; }
      }
      if (best) {
        lastPop = Date.now(); mapHold = false;
        best.click();
        if (isError) emit('error');
        emit('confirm');
        return true;
      }
    }
    return false;
  }
  function findReserve() {
    const orig = [...document.querySelectorAll(RESERVE_SELECTOR)].find(b => visible(b) && enabled(b) && /reserve tickets/i.test(b.textContent || ''));
    if (orig) return orig;
    const btns = [...document.querySelectorAll('button,[role="button"]')];
    const exact = btns.find(b => visible(b) && enabled(b) && /^\s*reserve (tickets?|seats?)\s*$/i.test(b.textContent || ''));
    if (exact) return exact;
    const foot = [...document.querySelectorAll('[class*="SidePanel__StyledFooter"] button, [class*="StyledFooter"] button')]
      .filter(b => visible(b) && enabled(b));
    const f = foot.find(b => /reserve/i.test(b.textContent || '')) || foot.find(b => !/cancel|back|close/i.test(b.textContent || ''));
    if (f) return f;
    return btns.find(b => visible(b) && enabled(b) && /reserve/i.test(b.textContent || '') && !/[$£€]\s*\d/.test(b.textContent || ''));
  }
  function pressBtn(b) { b.click(); }

  let lastScroll = 0, bottomHits = 0;
  function findScroller(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const st = getComputedStyle(p);
      if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 20) return p;
      p = p.parentElement;
    }
    return null;
  }
  function advanceList() {
    if (Date.now() - lastScroll < 450) return false;
    const first = listingEls().find(visible);
    if (!first) return false;
    const sc = findScroller(first);
    if (!sc) return false;
    lastScroll = Date.now();
    const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    if (atBottom) { if (++bottomHits > 3) { sc.scrollTop = 0; bottomHits = 0; } }
    else { bottomHits = 0; sc.scrollTop += Math.round(sc.clientHeight * 0.8); }
    return true;
  }

  function checkDone() {
    if (completed || !pendingTs) return;
    if (!DONE_RE.test(location.href)) return;
    if (Date.now() - pendingTs > PEND_TTL) { pendingTs = 0; persistTab(); return; }
    completed = true; doneAt = Date.now(); pendingTs = 0;
    clearPending(); persistTab();
    status = 'task_complete';
    playSiren(); flashTitle();
    emit('done'); setStatus();
  }
  function flashTitle() {
    try {
      const base = document.title; let n = 0;
      const iv = setInterval(() => {
        document.title = (n % 2) ? base : '*** reserved ***';
        if (++n > 24) { clearInterval(iv); document.title = base; }
      }, 500);
    } catch (e) {}
  }

  let busy = false, status = 'idle', lastScan = 0, lastStatusLog = '';
  function active() { return on && pageState() === 'ok'; }
  let lastPick = { key: '', ts: 0 };

  function ensureQty() {
    try {
      const want = qtyList(S.qty);
      for (const sel of document.getElementsByTagName('select')) {
        const opts = [...sel.options];
        if (!opts.length || !opts.every(o => /^\s*\d+(\s*tickets?)?\s*$/i.test(o.text))) continue;
        const cur = parseInt((sel.options[sel.selectedIndex] || {}).text, 10);
        if (want.includes(cur)) return;
        for (const w of want) {
          const o = opts.find(x => parseInt(x.text, 10) === w);
          if (!o) continue;
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, o.value);
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    } catch (e) {}
  }
  let busySince = 0, rsvPending = false, rsvTries = 0, rsvTimer = 0, mapPick = null, lastRsvPress = 0;
  function finish(ms) {
    rsvPending = false; clearTimeout(rsvTimer); rsvTimer = 0;
    setTimeout(() => { busy = false; }, ms);
  }

  function tryReserve() {
    clearTimeout(rsvTimer); rsvTimer = 0;
    if (!rsvPending) return;
    if (!active()) { rsvPending = false; busy = false; return; }
    if (handlePopups()) { status = 'dismissed_dialog'; setStatus(); finish(ERR_COOLDOWN); return; }

    if (mapPick && Date.now() - mapPick.ts < 350 && !anySelected()) { rsvTimer = setTimeout(tryReserve, 5); return; }
    const rb = findReserve();
    if (rb) {
      pendingTs = Date.now(); markPending(); persistTab();
      lastRsvPress = pendingTs;
      pressBtn(rb); status = 'reserve_sent'; emit('reserve'); setStatus();
      if (mapPick) { mapHold = true; mapPick = null; }
      finish(COOLDOWN);
      return;
    }
    if (++rsvTries < 600) rsvTimer = setTimeout(tryReserve, 4);
    else { status = 'reserve_not_found'; log('reserve', 'button_not_found_->_next_listing', 'err'); setStatus(); mapPick = null; finish(ERR_COOLDOWN); }
  }
  function runMap(m) {
    busy = true; busySince = Date.now();
    noteTry(m.key);
    if (completed || doneAt) { completed = false; doneAt = 0; persistTab(); }
    if (m.kind === 'section') {
      status = 'map_section'; setStatus();
      emit('mapsec', { label: m.label });
      lastSec = m.name || ''; lastSecClick = { key: m.key, ts: Date.now() };
      fire(m.el);
      finish(120);
      return;
    }
    status = 'map_seats'; setStatus();
    emit('mapseat', { label: m.label, q: m.q });
    ensureQty();
    for (const s of m.seats) fire(s.el);
    mapPick = { ts: Date.now(), n: m.seats.length };
    rsvPending = true; rsvTries = 0;
    tryReserve();
  }
  function scan() {
    if (pendingTs) checkDone();
    if (!active()) return;
    lastScan = Date.now();
    if (busy) {
      if (rsvPending) tryReserve();
      else if (handlePopups()) { status = 'dismissed_dialog'; setStatus(); finish(ERR_COOLDOWN); }
      if (busy && Date.now() - busySince > 4000) { busy = false; rsvPending = false; mapPick = null; }
      return;
    }
    if (handlePopups()) { status = 'dismissed_dialog'; setStatus(); return; }

    if (mapHold) {
      if (pendingTs && Date.now() - pendingTs < HOLD_MS && anySelected()) {
        if (Date.now() - lastRsvPress > 2500) { const rb = findReserve(); if (rb) { lastRsvPress = Date.now(); pressBtn(rb); log('reserve', 'pressed_again_(same_seats)', 'hit'); } }
        status = 'waiting_for_checkout'; setStatus();
        return;
      }
      mapHold = false;
    }
    const c = bestCandidate();
    if (c) {
      const fresh = blockedReason(c.el, true);
      if (fresh) { log('resale_guard', c.label + ' -> blocked_' + fresh + '_(last_check)', 'err'); return; }
      busy = true; busySince = Date.now();
      noteTry(c.key);
      if (completed || doneAt) { completed = false; doneAt = 0; persistTab(); }
      status = 'selecting'; setStatus();
      emit('select', { label: c.label });
      ensureQty();

      if (!(lastPick.key === c.key && Date.now() - lastPick.ts < 4000 && findReserve())) c.el.click();
      lastPick = { key: c.key, ts: Date.now() };
      rsvPending = true; rsvTries = 0;
      if (CLICK_DELAY > 0) rsvTimer = setTimeout(tryReserve, CLICK_DELAY);
      else tryReserve();
      return;
    }
    if (MAP_ENABLED) {
      let m = null;
      if (Date.now() - mapAt >= 60) { mapAt = Date.now(); m = mapCandidate(); }
      if (m) { seatViewEmptyAt = 0; runMap(m); return; }

      if (seatViewEmptyAt && Date.now() - seatViewEmptyAt > 900 && Date.now() - lastSecClick.ts < 20000) {
        if (resetMap()) { seatViewEmptyAt = 0; lastSecClick = { key: '', ts: 0 }; }
      }
    }
    status = advanceList() ? 'scanning_list' : 'watching'; setStatus();
  }
  let sched = false;
  const runScan = () => { sched = false; scan(); };
  const schedule = () => {
    if (sched) return;
    sched = true;
    const gap = document.readyState === 'complete' ? MIN_GAP_READY : MIN_GAP_LOADING;
    const w = gap - (Date.now() - lastScan);
    if (w <= 0) queueMicrotask(runScan); else setTimeout(runScan, w);
  };

  const mo = new MutationObserver(() => { if (on || pendingTs) schedule(); });
  mo.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-disabled', 'fill', 'style'] });
  setInterval(scan, TICK);

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;';
  let root = null, uiReady = false, lg = null;
  const $ = id => root.getElementById(id);
  const inputs = {};
  let pos = { x: 12, y: 12 };
  try { pos = JSON.parse(GM_getValue('nexus_pos2', 'null')) || pos; } catch (e) {}
  const place = () => {
    pos.x = Math.max(0, Math.min(pos.x, innerWidth - 60)); pos.y = Math.max(0, Math.min(pos.y, innerHeight - 40));
    host.style.left = pos.x + 'px'; host.style.top = pos.y + 'px';
  };

  let ttPolicy = null;
  function setHTML(el, html) {
    try { el.innerHTML = html; return; } catch (e) {}
    try {
      if (!ttPolicy) ttPolicy = window.trustedTypes.createPolicy('nexus_' + Math.random().toString(36).slice(2, 6), { createHTML: x => x });
      el.innerHTML = ttPolicy.createHTML(html);
    } catch (e) { console.error('[nexus_] could not build panel', e); }
  }
  function buildUI() {
    if (uiReady) return;
    uiReady = true;
    if (!root) root = host.attachShadow({ mode: 'closed' });
    setHTML(root, `
<style>
*{box-sizing:border-box;font-family:"Courier New",Consolas,monospace;text-transform:lowercase}
#p{width:470px;max-height:92vh;overflow:auto;background:#000;color:#00ff66;border:1px solid #00ff6655;border-radius:6px;box-shadow:0 0 18px #00ff6622;padding:14px;font-size:16px;transition:width .3s cubic-bezier(.2,.8,.2,1),padding .3s,box-shadow .3s}
#p.min{width:300px;padding:10px 12px;box-shadow:0 0 12px #00ff6633}
#p::-webkit-scrollbar{width:4px}#p::-webkit-scrollbar-thumb{background:#00ff6644}
#h{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;user-select:none;padding-bottom:8px;border-bottom:1px dashed #00ff6633;margin-bottom:8px;transition:padding .3s,margin .3s,border-color .3s}
#p.min #h{padding-bottom:0;margin-bottom:0;border-bottom-color:transparent}
.t{font-size:28px;font-weight:bold;text-shadow:0 0 8px #00ff66;transition:font-size .3s}#p.min .t{font-size:22px}
.s{font-size:15px;opacity:.6;max-height:24px;overflow:hidden;transition:max-height .3s,opacity .3s}#p.min .s{max-height:0;opacity:0}
#dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#00ff6633;margin-left:9px;vertical-align:middle;transition:.2s}
#p.on #dot{background:#00ff66;box-shadow:0 0 9px #00ff66;animation:pl 1.2s infinite}
@keyframes pl{50%{opacity:.35}}
.hr{display:flex;align-items:center;gap:10px}
.bar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.run{display:flex;align-items:center;gap:12px;cursor:pointer;font-size:28px;font-weight:bold}.run input{display:none}.run i{position:relative;display:block;width:88px;height:46px;border:1px solid #00ff66;border-radius:24px;transition:.2s}.run i:before{content:"";position:absolute;left:5px;top:5px;width:34px;height:34px;background:#00ff66;border-radius:50%;opacity:.45;transition:.2s}.run input:checked+i{background:#00ff6622;box-shadow:0 0 14px #00ff66}.run input:checked+i:before{transform:translateX(42px);opacity:1}.run:hover i{box-shadow:0 0 10px #00ff6688}
#p.min .run{font-size:18px;gap:8px}#p.min .run i{width:56px;height:30px}#p.min .run i:before{width:22px;height:22px;left:4px;top:3px}#p.min .run input:checked+i:before{transform:translateX(26px)}
button{background:#000;color:#00ff66;border:1px solid #00ff66;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:15px}
button:hover:not(:disabled){background:#00ff6622;box-shadow:0 0 6px #00ff66}
button:disabled{opacity:.3;cursor:not-allowed}
#mn{width:30px;height:30px;padding:0;border-radius:50%;font-size:20px;line-height:26px;text-align:center;flex:none;transition:transform .3s,background .2s}
#p.min #mn{transform:rotate(180deg)}
#rs{margin-left:auto;font-size:20px;padding:1px 9px}
#wrap{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows .32s cubic-bezier(.2,.8,.2,1),opacity .25s}
#p.min #wrap{grid-template-rows:0fr;opacity:0;pointer-events:none}
#main{overflow:hidden;min-height:0}
.b2{display:flex;gap:6px;margin-bottom:8px}.b2 button{flex:1}
#lg{height:310px;overflow:hidden;border:1px solid #00ff6622;border-radius:4px;background:#000;padding:6px 8px;font-size:12px;line-height:1.4}
.l{white-space:pre-wrap;word-break:break-all}.l.scan{opacity:.65}.l.cfg{color:#b8ffd0}.l.hit{color:#fff;text-shadow:0 0 6px #00ff66}.l.err{color:#ff4d4d}
#st{word-break:break-all;margin:8px 0 10px;font-size:14px;opacity:.85}
#st.ok{opacity:1;color:#fff;text-shadow:0 0 8px #00ff66}
.f{display:flex;flex-direction:column;gap:6px}
.r{display:flex;align-items:center;gap:6px}.r label{width:128px;opacity:.75}
.r input{flex:1;min-width:0;background:#031a0c;color:#00ff66;border:1px solid #00ff6644;border-radius:3px;padding:6px 8px;font-size:16px;outline:none}
.r input:focus{border-color:#00ff66;box-shadow:0 0 6px #00ff6655}
.ins{margin-top:12px;border-top:1px dashed #00ff6633;padding-top:10px;font-size:14px;line-height:1.5;opacity:.7}
</style>
<div id="p">
  <div id="h"><div><div class="t">nexus_<span id="dot"></span></div><div class="s">by_jass</div></div><div class="hr"><label class="run" id="runw"><span id="pwl">run</span><input type="checkbox" id="pw"><i></i></label><button id="mn" title="minimize">&#8211;</button></div></div>
  <div id="wrap"><div id="main">
    <div class="bar">
      <button id="sn" title="sound">sound_on</button>
      <button id="rs" title="reset">&#8635;</button>
    </div>
    <div class="b2"><button id="cp">copy_mutation</button><button id="pa" disabled>paste_mutation</button></div>
    <div id="lg"></div>
    <div id="st">status:_idle</div>
    <div class="f" id="fields"></div>
    <div class="ins">
      instructions_<br>
      type_: pick a suggestion or type your own (accessible / wheelchair seats are only taken when you pick one of those)<br>
      section_: 303 | 300-309 | 306,300,309 | -300 (whole 300 line)<br>
      row_: 1-8 | a-f | -6 | wc<br>
      seat_: 4,5 | 1-15<br>
      price_: 43 | 40-45 | -50<br>
      quantity_: 2 | 3,2,1 | 1-5 (biggest first, never leaves 1 lonely seat)<br>
      press enter to apply a value, empty = all<br>
      resale / vip / platinum are always skipped, map = blue only<br>
      alt+z hides / shows this panel, &#8211; minimizes it
    </div>
  </div></div>
  <datalist id="tl"></datalist>
</div>`);
    lg = $('lg');
    setHTML($('tl'), TYPES.map(t => `<option value="${t}">`).join(''));
    $('runw').addEventListener('mousedown', e => e.stopPropagation());
    $('mn').addEventListener('mousedown', e => e.stopPropagation());
    FIELDS.forEach(([k, label, ph]) => {
      const row = document.createElement('div'); row.className = 'r';
      const lb = document.createElement('label'); lb.textContent = label.replace(/ /g, '_') + '_';
      const inp = document.createElement('input'); inp.placeholder = ph; inp.value = S[k]; inp.spellcheck = false;
      if (k === 'type') inp.setAttribute('list', 'tl');
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const v = inp.value.trim();
          S[k] = v ? v : (k === 'qty' ? '2' : 'all');
          inp.value = S[k]; persistTab(); clearAttempts(); emit('config', k); inp.blur();
        }
      });
      inp.addEventListener('blur', () => { inp.value = S[k]; });
      row.append(lb, inp); $('fields').appendChild(row); inputs[k] = inp;
    });
    $('p').addEventListener('keydown', e => e.stopPropagation());
    $('p').addEventListener('keyup', e => e.stopPropagation());

    $('pw').addEventListener('change', e => {
      on = e.target.checked; status = on ? 'watching' : 'idle';
      if (!on) { pendingTs = 0; mapHold = false; clearPending(); }
      persistTab(); syncUI(); schedule();
    });
    $('mn').addEventListener('click', () => { minimized = !minimized; persistTab(); applyMin(); });
    $('rs').addEventListener('click', () => { S = Object.assign({}, DEFAULTS); persistTab(); clearAttempts(); syncUI(); emit('config', '*'); });
    $('cp').addEventListener('click', () => { GM_setValue('nexus_clip', JSON.stringify(S)); status = 'mutation_copied'; setStatus(); });
    $('pa').addEventListener('click', () => {
      try { const c = JSON.parse(GM_getValue('nexus_clip', 'null')); if (c) { S = Object.assign({}, DEFAULTS, c); persistTab(); clearAttempts(); syncUI(); emit('config', '*'); status = 'mutation_pasted'; setStatus(); } } catch (e) {}
    });
    try { GM_addValueChangeListener('nexus_clip', refreshPaste); } catch (e) {}
    $('sn').addEventListener('click', () => { soundOn = !soundOn; try { GM_setValue('nexus_snd', soundOn); } catch (e) {} snLabel(); if (soundOn) audio(); });

    let drag = null;
    $('h').addEventListener('mousedown', e => { drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); });
    addEventListener('mousemove', e => { if (drag) { pos.x = e.clientX - drag.dx; pos.y = e.clientY - drag.dy; place(); } });
    addEventListener('mouseup', () => { if (drag) { drag = null; GM_setValue('nexus_pos2', JSON.stringify(pos)); } });
    try { GM_addValueChangeListener('nexus_pos2', (n, o, v, remote) => { if (remote) { try { pos = JSON.parse(v); place(); } catch (e) {} } }); } catch (e) {}

    snLabel(); applyMin(); refreshPaste();
    flushLog();
  }
  function applyMin() {
    if (!uiReady) return;
    $('p').classList.toggle('min', minimized);
    $('mn').title = minimized ? 'expand' : 'minimize';
  }
  const refreshPaste = () => { if (uiReady) $('pa').disabled = !GM_getValue('nexus_clip', ''); };
  const snLabel = () => { if (uiReady) $('sn').textContent = soundOn ? 'sound_on' : 'sound_off'; };
  function syncUI() {
    if (!uiReady) return;
    $('pw').checked = on;
    $('pwl').textContent = 'run';
    $('p').classList.toggle('on', on);
    FIELDS.forEach(([k]) => { if (root.activeElement !== inputs[k]) inputs[k].value = S[k]; });
    setStatus();
  }
  function setStatus() {
    const ps = pageState();
    let t;
    if (completed) t = 'status:_task_complete_(reserved)';
    else if (ps === 'done') t = 'status:_' + (/authorization/i.test(location.href) ? 'auth' : 'checkout') + '_page' + (pendingTs ? '_(confirming)' : '_(idle)');
    else if (ps !== 'ok') t = 'status:_offline_(not_on_an_event_page)';
    else if (!on) t = 'status:_idle_(power_off)';
    else t = 'status:_' + status;
    if (uiReady) { const st = $('st'); st.textContent = t; st.className = completed ? 'ok' : ''; }
    if (on && ps === 'ok' && status !== lastStatusLog) {
      lastStatusLog = status;
      if (!/^(selecting|reserve_sent|task_complete|map_seats|map_section)$/.test(status)) log('nexus', status, /not_found/.test(status) ? 'err' : 'scan');
    }
  }

  let actx = null, master = null, soundOn = true, tickWin = [], sirenQueued = 0, lastResume = 0;
  try { soundOn = GM_getValue('nexus_snd', true) !== false; } catch (e) {}
  function audio() {
    if (!actx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        actx = new AC({ latencyHint: 'interactive' });
        master = actx.createGain(); master.gain.value = 1;
        const comp = actx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 8;
        master.connect(comp); comp.connect(actx.destination);
        actx.onstatechange = () => {
          if (actx.state === 'running') flushSiren();
          else if (actx.state !== 'closed') actx.resume().catch(() => {});
        };
      } catch (e) { actx = null; }
    }
    if (actx && actx.state !== 'running' && Date.now() - lastResume > 250) {
      lastResume = Date.now();
      try { actx.resume().then(flushSiren).catch(() => {}); } catch (e) {}
    }
    return actx;
  }

  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach(ev => addEventListener(ev, () => audio(), true));
  document.addEventListener('visibilitychange', () => audio());
  setInterval(() => { if (actx && actx.state !== 'running') audio(); }, 1000);

  const PENTA = [0, 2, 4, 7, 9];
  function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function tick(edgeKey, style) {
    if (!soundOn) return;
    if (!actx || actx.state !== 'running') { audio(); return; }
    const now = actx.currentTime;
    tickWin = tickWin.filter(t => now - t < 0.1);
    if (tickWin.length >= 9) return;
    tickWin.push(now);
    const h = hashStr(edgeKey);
    let f = 330 * Math.pow(2, (PENTA[h % 5] + 12 * ((h >> 3) % 3)) / 12);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = style === 'err' ? 'square' : style === 'hit' ? 'triangle' : 'sine';
    if (style === 'err') f = 100 + (h % 4) * 14;
    o.frequency.value = f;
    const vol = style === 'scan' ? 0.06 : style === 'cfg' ? 0.1 : 0.2;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (style === 'err' ? 0.13 : 0.07));
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + 0.14);
  }

  function playSiren() {
    if (!SIREN_IGNORES_MUTE && !soundOn) return;
    const c = audio();
    if (!c) return;
    if (c.state !== 'running') { sirenQueued = Date.now(); return; }
    sirenQueued = 0;
    const t0 = c.currentTime, D = SIREN_SECS, per = 0.3, lo = 750, hi = 1900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
    g.gain.setValueAtTime(0.6, t0 + D - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
    g.connect(master);
    [['square', 1], ['sawtooth', 1.5]].forEach(([type, mul]) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(lo * mul, t0);
      for (let i = 0; i * per < D; i++) o.frequency.linearRampToValueAtTime((i % 2 ? lo : hi) * mul, t0 + (i + 1) * per);
      o.connect(g); o.start(t0); o.stop(t0 + D + 0.05);
    });
  }
  function flushSiren() { if (sirenQueued && Date.now() - sirenQueued < 30000) playSiren(); }

  const LOG_MAX = 40, logBuf = [];
  let logTimer = 0, hbAt = 0;
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function log(tag, msg, style) {
    style = style || 'scan';
    const d = new Date();
    const ts = String(d.getSeconds()).padStart(2, '0') + '.' + String(d.getMilliseconds()).padStart(3, '0');
    logBuf.push('<div class="l ' + style + '">' + ts + ' ' + esc(tag) + '&gt; ' + esc(msg) + '</div>');
    if (logBuf.length > LOG_MAX) logBuf.shift();
    if (!shown || minimized) return;
    tick(tag + style, style);
    if (!logTimer) logTimer = setTimeout(flushLog, 33);
  }
  function flushLog() { logTimer = 0; if (shown && uiReady && lg) { lg.innerHTML = logBuf.join(''); lg.scrollTop = lg.scrollHeight; } }
  function hb(tag, msg) { const n = Date.now(); if (n - hbAt < 450) return; hbAt = n; log(tag, msg, 'scan'); }
  const MODMAP = { type: 'type_match', section: 'sec_parse', row: 'row_parse', seat: 'seat_parse', price: 'price_range', qty: 'qty_rank' };
  function emit(kind, d) {
    if (kind === 'config') log(d === '*' ? 'config' : (MODMAP[d] || d), d === '*' ? 'reset_to_defaults' : d + '_set_to_' + S[d], 'cfg');
    else if (kind === 'select') log('select', (d && d.label ? d.label : 'listing') + '_qty_' + qtyList(S.qty)[0], 'hit');
    else if (kind === 'mapsec') log('map', (d && d.label ? d.label : 'section') + '_turned_blue_->_zoom', 'hit');
    else if (kind === 'mapseat') log('map', (d && d.label ? d.label : 'seats') + '_qty_' + (d && d.q), 'hit');
    else if (kind === 'reserve') log('reserve', 'pressed_->_waiting_for_checkout', 'hit');
    else if (kind === 'error') log('dialog_fix', 'error_popup_closed_->_keep_selecting', 'err');
    else if (kind === 'confirm') log('dialog_fix', 'dialog_cleared', 'hit');
    else if (kind === 'ban') log('retry_guard', 'listing_rests_2.5s_after_2_tries', 'err');
    else if (kind === 'done') { log('cleared', 'checkout_reached', 'hit'); log('reserved', 'task_complete', 'hit'); log('siren', 'playing_3s', 'hit'); }
  }

  addEventListener('keydown', e => {
    if (e.code === 'KeyZ' && e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation();
      try { audio(); } catch (x) {}
      toggle();
    }
  }, true);

  function mount() { const r = document.documentElement; if (r && !host.isConnected) r.appendChild(host); }
  function show() {
    try { buildUI(); } catch (e) { console.error('[nexus_] panel error', e); uiReady = false; }
    mount(); host.style.display = 'block'; place(); applyMin(); syncUI(); refreshPaste(); flushLog();
  }
  function toggle() {
    shown = !shown;
    if (shown) show(); else host.style.display = 'none';
    persistTab();
  }

  setInterval(() => { if (shown && !host.isConnected) mount(); }, 120);
  document.addEventListener('readystatechange', () => { if (shown) mount(); });

  let lastHref = location.href;
  const hrefChanged = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    checkDone(); syncUI(); schedule();
  };
  setInterval(hrefChanged, 200);
  addEventListener('popstate', hrefChanged);
  addEventListener('hashchange', hrefChanged);
  addEventListener('resize', () => { if (shown) place(); });

  try { console.log('[nexus_] v5.0 loaded - press alt+z to show / hide the panel'); } catch (e) {}
  log('nexus', 'v5.0_online', 'cfg');
  log('modules', 'resale_guard type_match sec_parse row_parse seat_parse price_range qty_rank map_blue_only', 'cfg');
  if (shown) show();
  if (completed) status = 'task_complete';
  checkDone();
  schedule();
})();
