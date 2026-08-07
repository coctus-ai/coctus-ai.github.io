/**
 * knowledge.js — a local knowledge base / RAG module. Upload documents
 * once, and every chat afterwards can automatically pull in the most
 * relevant passages — no backend, no embeddings API key, entirely
 * client-side and persistent across sessions (IndexedDB).
 *
 * Retrieval is TF-IDF over chunked text rather than vector embeddings —
 * there's no free, keyless, CORS-open embeddings API to call from a static
 * page, so this trades semantic nuance for something that actually works
 * with zero configuration and no ongoing cost. It's genuinely effective
 * for keyword/entity-heavy lookups (a term in a report, a CVE ID, a
 * hostname, a config value) which is most of what recon notes, project
 * docs, and reference material actually get queried for.
 */
const CoctusKnowledge = (() => {
  const DB_NAME = 'coctus-knowledge-v1';
  const STORE = 'documents';
  const CHUNK_SIZE = 900;
  const CHUNK_OVERLAP = 150;
  const MAX_DOC_CHARS = 400000; // ~ a few hundred pages of plain text, per document

  let dbPromise = null;
  let memoryFallback = null; // Map<id, doc> — used only if IndexedDB is unavailable

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
    if (!db) {
      memoryFallback = memoryFallback || new Map();
      return fn(memoryFallback);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result && result.__value !== undefined ? result.__value : result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------------- chunking ----------------
  function chunkText(text) {
    const clean = text.replace(/\r\n/g, '\n').trim();
    const chunks = [];
    let i = 0;
    while (i < clean.length) {
      const end = Math.min(i + CHUNK_SIZE, clean.length);
      // try to break on a paragraph/sentence boundary near the end
      let cut = end;
      if (end < clean.length) {
        const window = clean.slice(i + CHUNK_SIZE - 200, end + 1);
        const lastBreak = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
        if (lastBreak > 0) cut = i + CHUNK_SIZE - 200 + lastBreak + 1;
      }
      chunks.push(clean.slice(i, cut).trim());
      if (cut >= clean.length) break;
      i = Math.max(cut - CHUNK_OVERLAP, i + 1);
    }
    return chunks.filter(Boolean);
  }

  // ---------------- TF-IDF-ish scoring ----------------
  const STOPWORDS = new Set('a an the of to in on for and or is are was were be been being with as at by from this that these those it its into over under not no do does did can could should would will shall have has had you your i we our'.split(' '));
  function tokenize(text) {
    return (text.toLowerCase().match(/[a-z0-9][a-z0-9._-]{1,}/g) || []).filter(t => !STOPWORDS.has(t));
  }

  function scoreChunk(queryTerms, chunkTokens, df, totalChunks) {
    if (!chunkTokens.length) return 0;
    const tf = new Map();
    for (const t of chunkTokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const count = tf.get(term) || 0;
      if (!count) continue;
      const docFreq = df.get(term) || 1;
      const idf = Math.log((totalChunks + 1) / docFreq) + 1;
      score += (count / chunkTokens.length) * idf;
    }
    return score;
  }

  // ---------------- public API ----------------
  async function addDocument(name, text) {
    const trimmed = String(text || '').slice(0, MAX_DOC_CHARS);
    if (!trimmed.trim()) return { ok: false, error: 'document has no extractable text' };
    const chunks = chunkText(trimmed).map((c, idx) => ({ idx, text: c, tokens: tokenize(c) }));
    const doc = {
      id: 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: String(name || 'untitled').slice(0, 200),
      addedAt: Date.now(),
      chars: trimmed.length,
      chunkCount: chunks.length,
      chunks,
    };
    await withStore('readwrite', (store) => store.put ? store.put(doc) : store.set(doc.id, doc));
    return { ok: true, doc: { id: doc.id, name: doc.name, chunkCount: doc.chunkCount, chars: doc.chars, addedAt: doc.addedAt } };
  }

  async function listDocuments() {
    const rows = await withStore('readonly', (store) => {
      if (store.getAll) {
        return new Promise((resolve) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); });
      }
      return [...store.values()];
    });
    const resolved = await rows;
    return resolved.map(d => ({ id: d.id, name: d.name, chunkCount: d.chunkCount, chars: d.chars, addedAt: d.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  async function removeDocument(id) {
    await withStore('readwrite', (store) => store.delete(id));
    return { ok: true };
  }

  async function clearAll() {
    await withStore('readwrite', (store) => {
      if (store.clear) return store.clear();
      store.clear && store.clear();
    });
    return { ok: true };
  }

  async function hasDocuments() {
    const docs = await listDocuments();
    return docs.length > 0;
  }

  /** Retrieve the topK most relevant chunks across ALL stored documents for a query. */
  async function retrieve(query, topK = 5) {
    const queryTerms = [...new Set(tokenize(query))];
    if (!queryTerms.length) return [];
    const allDocs = await withStore('readonly', (store) => {
      if (store.getAll) {
        return new Promise((resolve) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); });
      }
      return [...store.values()];
    });
    const docs = await allDocs;
    if (!docs.length) return [];

    // document frequency across the whole corpus, for idf
    const df = new Map();
    let totalChunks = 0;
    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        totalChunks++;
        const seen = new Set(chunk.tokens);
        for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
      }
    }

    const scored = [];
    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        const score = scoreChunk(queryTerms, chunk.tokens, df, totalChunks);
        if (score > 0) scored.push({ score, docName: doc.name, docId: doc.id, chunkIdx: chunk.idx, text: chunk.text });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Builds a ready-to-inject system-prompt block from retrieved chunks, or '' if nothing matched. */
  async function buildContextBlock(query, topK = 5) {
    const hits = await retrieve(query, topK);
    if (!hits.length) return '';
    const body = hits.map((h, i) => `[${i + 1}] (from "${h.docName}")\n${h.text}`).join('\n\n');
    return `Knowledge base — passages retrieved from the user's uploaded documents that may be relevant to their message. Use them if relevant, cite the document name when you do, and don't invent content beyond what's shown:\n\n${body}`;
  }

  return { addDocument, listDocuments, removeDocument, clearAll, hasDocuments, retrieve, buildContextBlock };
})();
