/**
 * targets.js — target/program workspace. Tracks scope, findings, and notes
 * per bug bounty program or engagement, persisted locally (IndexedDB).
 *
 * This is the foundation the other planned modules attach to: the scan
 * parser writes findings here, the report builder reads findings from
 * here, and recon diffing compares scan snapshots stored here.
 *
 * It also does double duty as a SAFETY mechanism, not just organization:
 * whichever target is "active" gets its scope (in/out) injected into every
 * chat's system prompt (see buildContextBlock), so the model is
 * consistently reminded what's actually authorized to touch — the same
 * habit a careful human tester keeps pinned next to their terminal.
 */
const CoctusTargets = (() => {
  const DB_NAME = 'coctus-targets-v1';
  const STORE = 'targets';
  const ACTIVE_KEY = 'coctus_active_target_v1';

  let dbPromise = null;
  let memoryFallback = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { memoryFallback = memoryFallback || new Map(); resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { memoryFallback = memoryFallback || new Map(); resolve(null); };
    });
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    if (!db) { memoryFallback = memoryFallback || new Map(); return fn(memoryFallback); }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result && result.__value !== undefined ? result.__value : result);
      tx.onerror = () => reject(tx.error);
    });
  }

  function newId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
  const STATUSES = ['open', 'reported', 'triaged', 'fixed', 'duplicate', 'informative', 'n/a'];

  function parseScopeLines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  }

  // ---------------- targets CRUD ----------------
  async function createTarget({ name, scopeIn, scopeOut, notes }) {
    const t = {
      id: newId('tgt'),
      name: String(name || 'Untitled target').slice(0, 200),
      scopeIn: parseScopeLines(scopeIn),
      scopeOut: parseScopeLines(scopeOut),
      notes: String(notes || ''),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      findings: [],
      scans: [],
    };
    await withStore('readwrite', (store) => store.put(t));
    return t;
  }

  async function listTargets() {
    const rows = await withStore('readonly', (store) => {
      if (store.getAll) return new Promise((resolve) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); });
      return [...store.values()];
    });
    const resolved = await rows;
    return resolved.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function getTarget(id) {
    return withStore('readonly', (store) => {
      if (store.get) return new Promise((resolve) => { const r = store.get(id); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); });
      return store.get(id) || null;
    });
  }

  async function updateTarget(id, patch) {
    const t = await getTarget(id);
    if (!t) return { ok: false, error: 'target not found' };
    if (patch.name !== undefined) t.name = String(patch.name).slice(0, 200);
    if (patch.scopeIn !== undefined) t.scopeIn = parseScopeLines(patch.scopeIn);
    if (patch.scopeOut !== undefined) t.scopeOut = parseScopeLines(patch.scopeOut);
    if (patch.notes !== undefined) t.notes = String(patch.notes);
    t.updatedAt = Date.now();
    await withStore('readwrite', (store) => store.put(t));
    return { ok: true, target: t };
  }

  async function deleteTarget(id) {
    await withStore('readwrite', (store) => store.delete(id));
    const active = getActiveId();
    if (active === id) setActiveId(null);
    return { ok: true };
  }

  // ---------------- active target (drives system-prompt injection) ----------------
  function getActiveId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
  }
  function setActiveId(id) {
    try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
  }
  async function getActiveTarget() {
    const id = getActiveId();
    if (!id) return null;
    return getTarget(id);
  }

  // ---------------- findings ----------------
  async function addFinding(targetId, { title, severity, status, description, poc, cvss }) {
    const t = await getTarget(targetId);
    if (!t) return { ok: false, error: 'target not found' };
    const finding = {
      id: newId('fnd'),
      title: String(title || 'Untitled finding').slice(0, 300),
      severity: SEVERITIES.includes(severity) ? severity : 'info',
      status: STATUSES.includes(status) ? status : 'open',
      description: String(description || ''),
      poc: String(poc || ''),
      cvss: cvss ? String(cvss).slice(0, 20) : '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    t.findings.push(finding);
    t.updatedAt = Date.now();
    await withStore('readwrite', (store) => store.put(t));
    return { ok: true, finding, target: t };
  }

  async function updateFinding(targetId, findingId, patch) {
    const t = await getTarget(targetId);
    if (!t) return { ok: false, error: 'target not found' };
    const f = t.findings.find(f => f.id === findingId);
    if (!f) return { ok: false, error: 'finding not found' };
    Object.assign(f, patch, { updatedAt: Date.now() });
    t.updatedAt = Date.now();
    await withStore('readwrite', (store) => store.put(t));
    return { ok: true, finding: f };
  }

  async function removeFinding(targetId, findingId) {
    const t = await getTarget(targetId);
    if (!t) return { ok: false, error: 'target not found' };
    t.findings = t.findings.filter(f => f.id !== findingId);
    t.updatedAt = Date.now();
    await withStore('readwrite', (store) => store.put(t));
    return { ok: true };
  }

  // ---------------- scan snapshots (for the diffing module to build on) ----------------
  async function addScanSnapshot(targetId, { label, tool, items }) {
    const t = await getTarget(targetId);
    if (!t) return { ok: false, error: 'target not found' };
    const scan = { id: newId('scan'), label: String(label || tool || 'scan'), tool: String(tool || 'manual'), items: Array.isArray(items) ? items : [], createdAt: Date.now() };
    t.scans.push(scan);
    t.updatedAt = Date.now();
    await withStore('readwrite', (store) => store.put(t));
    return { ok: true, scan };
  }

  // ---------------- scope check (safety helper — used by the UI and can be used by tools) ----------------
  function isInScope(target, hostOrUrl) {
    if (!target) return null; // unknown — no active target to check against
    const needle = String(hostOrUrl || '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const matches = (pattern) => {
      pattern = pattern.toLowerCase().replace(/^https?:\/\//, '').replace(/^\*\./, '');
      return needle === pattern || needle.endsWith('.' + pattern);
    };
    if (target.scopeOut.some(matches)) return false;
    if (!target.scopeIn.length) return null; // no explicit in-scope list defined — can't confirm
    return target.scopeIn.some(matches);
  }

  /** Compact block for system-prompt injection — scope + open findings count, kept short. */
  async function buildContextBlock() {
    const t = await getActiveTarget();
    if (!t) return '';
    const openCount = t.findings.filter(f => f.status === 'open').length;
    const lines = [
      `Active target/program: "${t.name}".`,
      t.scopeIn.length ? `In-scope: ${t.scopeIn.join(', ')}` : 'In-scope: not specified — ask before assuming anything is authorized.',
      t.scopeOut.length ? `Explicitly OUT of scope (never suggest testing these): ${t.scopeOut.join(', ')}` : '',
      t.notes ? `Notes: ${t.notes.slice(0, 500)}` : '',
      `${t.findings.length} finding(s) logged so far (${openCount} open).`,
      'Stay within the stated scope. If asked about a host not listed, flag that its scope status is unclear rather than assuming it\'s fair game.',
    ].filter(Boolean);
    return 'Target/program context:\n' + lines.join('\n');
  }

  return {
    SEVERITIES, STATUSES,
    createTarget, listTargets, getTarget, updateTarget, deleteTarget,
    getActiveId, setActiveId, getActiveTarget,
    addFinding, updateFinding, removeFinding,
    addScanSnapshot, isInScope, buildContextBlock,
  };
})();
