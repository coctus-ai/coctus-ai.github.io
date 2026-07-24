/**
 * memory.js — all persistence for Coctus AI, plus two next-gen upgrades:
 *
 *  - Semantic-ish recall: facts and past-session messages are ranked by
 *    term-vector cosine similarity against the current message, not just
 *    "was this the most recent thing." No embeddings API needed — this is
 *    a small in-browser bag-of-words model, good enough to surface "oh,
 *    we talked about this before" without any network call.
 *  - Auto-summarization: once a session gets long, older turns are folded
 *    into a running summary (one model call, done lazily) so the model
 *    keeps working context instead of the raw transcript growing forever.
 *
 * Everything still lives in localStorage on this device. Nothing is
 * uploaded anywhere except the chat requests you explicitly send to your
 * chosen model provider via Puter.js.
 */

const CoctusMemory = (() => {
  const KEYS = {
    facts: 'coctus_facts_v1',
    sessions: 'coctus_sessions_v1',
    activeId: 'coctus_active_session_v1',
    prefs: 'coctus_prefs_v1',
    profile: 'coctus_profile_v1',
  };

  const SUMMARY_TRIGGER_MESSAGES = 16; // fold older turns once history exceeds this
  const SUMMARY_KEEP_RECENT = 8;       // always keep this many most-recent messages raw

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  let storageErrorHandler = null;
  /** Lets app.js register a callback for storage failures the user should
   * actually know about (e.g. show a toast), instead of them vanishing
   * into console.warn where nobody but a developer would ever see them. */
  function onStorageError(fn) { storageErrorHandler = fn; }

  function isQuotaError(err) {
    return err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (err) {
      if (isQuotaError(err) && key === KEYS.sessions && Array.isArray(value) && value.length > 3) {
        // Auto-recover: drop the oldest unstarred sessions (keep the most
        // recent handful plus anything starred) and retry once, rather than
        // silently losing the write — this is what actually happens when
        // someone's had this open for months with dozens of long sessions.
        const sorted = [...value].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.updated - a.updated);
        const trimmed = sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.7)));
        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
          storageErrorHandler && storageErrorHandler(err, key, { recovered: true, droppedCount: value.length - trimmed.length });
          return true;
        } catch (err2) {
          console.warn('Coctus: storage write failed even after pruning old sessions', err2);
          storageErrorHandler && storageErrorHandler(err2, key, { recovered: false });
          return false;
        }
      }
      console.warn('Coctus: storage write failed (quota?)', err);
      storageErrorHandler && storageErrorHandler(err, key, { recovered: false });
      return false;
    }
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- Facts (long-term memory) ----
  // Facts can be pinned: pinned facts always ride along in system context
  // and always sort first in the Memory panel, regardless of relevance
  // scoring or recency — for things the user wants Coctus to never "forget"
  // between sessions (e.g. "always answer in Spanish").
  function getFacts() {
    return read(KEYS.facts, []).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created - a.created);
  }
  function addFact(text) {
    const facts = read(KEYS.facts, []);
    const fact = { id: uid(), text: text.trim(), created: Date.now(), pinned: false };
    facts.unshift(fact);
    write(KEYS.facts, facts);
    return fact;
  }
  function removeFact(id) {
    write(KEYS.facts, read(KEYS.facts, []).filter(f => f.id !== id));
  }
  function editFact(id, text) {
    const facts = read(KEYS.facts, []);
    const f = facts.find(f => f.id === id);
    if (f && text.trim()) f.text = text.trim();
    write(KEYS.facts, facts);
    return f || null;
  }
  function togglePinFact(id) {
    const facts = read(KEYS.facts, []);
    const f = facts.find(f => f.id === id);
    if (f) f.pinned = !f.pinned;
    write(KEYS.facts, facts);
    return f || null;
  }

  // Very lightweight heuristic extraction — looks for explicit "remember"
  // style statements so memory grows without the user managing it by hand.
  function autoExtract(userText) {
    const patterns = [
      /\bremember (?:that )?(.+)/i,
      /\bmy name is (.+)/i,
      /\bi (?:prefer|like|use|work with|work at|work on) (.+)/i,
      /\bcall me (.+)/i,
    ];
    for (const re of patterns) {
      const m = userText.match(re);
      if (m && m[1] && m[1].length < 200) {
        const clean = m[1].replace(/[.!?]+$/, '').trim();
        if (clean) return addFact(clean.charAt(0).toUpperCase() + clean.slice(1));
      }
    }
    return null;
  }

  function factsAsSystemContext() {
    const facts = getFacts();
    if (!facts.length) return '';
    return 'Known context about the user, saved from earlier sessions:\n' +
      facts.slice(0, 40).map(f => `- ${f.text}`).join('\n');
  }

  // ---------------- lightweight semantic recall (bag-of-words cosine) ----------------
  const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','to','of','in','on','for',
    'and','or','but','with','as','at','by','it','this','that','i','you','me','my','your','we','our',
    'do','does','did','can','could','would','should','will','shall','have','has','had','not','so','if',
    'what','when','where','who','how','why','please','just','about','into','from','than','then']);

  function tokenize(text) {
    return (text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(t => t.length > 2 && !STOPWORDS.has(t)) || [];
  }

  function vectorize(tokens) {
    const v = {};
    for (const t of tokens) v[t] = (v[t] || 0) + 1;
    return v;
  }

  function cosine(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (const k in a) { magA += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
    for (const k in b) magB += b[k] * b[k];
    if (!magA || !magB) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  function scoreText(queryVec, text) {
    return cosine(queryVec, vectorize(tokenize(text)));
  }

  /** Rank saved facts by relevance to `query`, return top matches above a floor. */
  function recallFacts(query, topK = 5) {
    const all = getFacts();
    const pinned = all.filter(f => f.pinned);
    const qVec = vectorize(tokenize(query));
    if (!Object.keys(qVec).length) return pinned;
    const scored = all
      .filter(f => !f.pinned)
      .map(f => ({ fact: f, score: scoreText(qVec, f.text) }))
      .filter(r => r.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, topK - pinned.length))
      .map(r => r.fact);
    return [...pinned, ...scored];
  }

  /** Rank past messages (across ALL sessions, excluding the given one) by relevance. */
  function recallPastMessages(query, excludeSessionId, topK = 4) {
    const qVec = vectorize(tokenize(query));
    if (!Object.keys(qVec).length) return [];
    const hits = [];
    for (const session of getSessions()) {
      if (session.id === excludeSessionId) continue;
      for (const m of session.messages) {
        if (m.role !== 'assistant' && m.role !== 'user') continue;
        if (m.content.length < 20) continue;
        const score = scoreText(qVec, m.content);
        if (score > 0.12) hits.push({ score, sessionTitle: session.title, role: m.role, snippet: m.content.slice(0, 280) });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /** Build a system-context block combining fact recall + cross-session recall for this message. */
  function recallContext(query, excludeSessionId) {
    const facts = recallFacts(query);
    const past = recallPastMessages(query, excludeSessionId);
    if (!facts.length && !past.length) return '';
    let out = '';
    if (facts.length) out += 'Relevant saved facts about the user:\n' + facts.map(f => `- ${f.text}`).join('\n') + '\n';
    if (past.length) {
      out += 'Relevant snippets from earlier, different conversations (for continuity — do not assume the user is repeating themselves, just use as background):\n' +
        past.map(p => `- [from "${p.sessionTitle}", ${p.role}]: ${p.snippet}`).join('\n');
    }
    return out.trim();
  }

  // ---------------- auto-summarization ----------------
  /**
   * Returns { context, summaryUpdated }: `context` is the array of
   * {role, content} messages to actually send to the model for this turn's
   * history (either the raw list, or a summary + recent tail). Mutates and
   * persists session.summary when it folds messages in. `chatFn` is
   * CoctusModels.chat, passed in to avoid a circular module dependency.
   */
  async function getConversationContext(session, model, chatFn) {
    const all = session.messages.slice(0, -1); // exclude the just-added user turn; caller appends it separately
    if (all.length <= SUMMARY_TRIGGER_MESSAGES) {
      return all.map(m => ({ role: m.role, content: m.content }));
    }
    const alreadySummarizedThrough = session.summaryThrough || 0;
    const toFold = all.slice(alreadySummarizedThrough, all.length - SUMMARY_KEEP_RECENT);
    const tail = all.slice(all.length - SUMMARY_KEEP_RECENT);

    if (toFold.length >= 2) {
      try {
        const foldText = toFold.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
        const prompt = session.summary
          ? `Existing running summary of the conversation so far:\n${session.summary}\n\nFold in these additional turns, producing one updated, still-concise running summary (bullet points, key facts/decisions/code choices, under 300 words):\n\n${foldText}`
          : `Summarize this conversation so far into a concise running summary (bullet points, key facts/decisions/code choices, under 300 words):\n\n${foldText}`;
        const summary = await chatFn(
          [{ role: 'system', content: 'You produce concise, factual running summaries of conversations for context-management purposes. Bullet points only, no preamble.' },
           { role: 'user', content: prompt }],
          { model, temperature: 0.2 }
        );
        session.summary = summary.trim();
        session.summaryThrough = all.length - SUMMARY_KEEP_RECENT;
        saveSession(session);
      } catch (err) {
        console.warn('Coctus: conversation summarization failed, falling back to raw tail.', err);
        return all.slice(-SUMMARY_TRIGGER_MESSAGES).map(m => ({ role: m.role, content: m.content }));
      }
    }

    const context = [];
    if (session.summary) {
      context.push({ role: 'system', content: `Summary of earlier parts of this conversation:\n${session.summary}` });
    }
    context.push(...tail.map(m => ({ role: m.role, content: m.content })));
    return context;
  }

  // ---- Profile (lightweight personalization, distinct from free-form facts) ----
  function getProfile() { return read(KEYS.profile, { name: '', role: '', preferences: '' }); }
  function saveProfile(p) { write(KEYS.profile, p); }
  function profileAsSystemContext() {
    const p = getProfile();
    const lines = [];
    if (p.name) lines.push(`The user's name is ${p.name}.`);
    if (p.role) lines.push(`The user's role/background: ${p.role}.`);
    if (p.preferences) lines.push(`Stated preferences for how to respond: ${p.preferences}.`);
    return lines.length ? 'User profile:\n' + lines.map(l => `- ${l}`).join('\n') : '';
  }

  // ---- Sessions (conversations) ----
  function getSessions() {
    return read(KEYS.sessions, []).sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.updated - a.updated);
  }

  /** Full-text search over session titles + message content, most recently updated first. */
  function searchSessions(query) {
    const q = (query || '').trim().toLowerCase();
    const all = getSessions();
    if (!q) return all;
    return all.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.messages || []).some(m => (m.content || '').toLowerCase().includes(q))
    );
  }

  function toggleStarSession(id) {
    const sessions = read(KEYS.sessions, []);
    const s = sessions.find(s => s.id === id);
    if (s) { s.starred = !s.starred; write(KEYS.sessions, sessions); }
    return s || null;
  }

  /** Export everything (sessions, facts, profile, prefs) as one portable JSON backup. */
  function exportBackup() {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: read(KEYS.sessions, []),
      facts: read(KEYS.facts, []),
      profile: read(KEYS.profile, {}),
      prefs: read(KEYS.prefs, {}),
    }, null, 2);
  }

  /** Restore a backup produced by exportBackup(). Merges sessions/facts by id (dedupes), replaces profile/prefs. */
  function importBackup(json) {
    let data;
    try { data = JSON.parse(json); } catch (err) { throw new Error('That file isn\'t valid JSON.'); }
    if (!data || typeof data !== 'object') throw new Error('Unrecognized backup format.');
    let importedSessions = 0, importedFacts = 0;
    if (Array.isArray(data.sessions)) {
      const existing = read(KEYS.sessions, []);
      const byId = new Map(existing.map(s => [s.id, s]));
      for (const s of data.sessions) { if (s && s.id) { byId.set(s.id, s); importedSessions++; } }
      write(KEYS.sessions, [...byId.values()]);
    }
    if (Array.isArray(data.facts)) {
      const existing = read(KEYS.facts, []);
      const byId = new Map(existing.map(f => [f.id, f]));
      for (const f of data.facts) { if (f && f.id) { byId.set(f.id, f); importedFacts++; } }
      write(KEYS.facts, [...byId.values()]);
    }
    if (data.profile && typeof data.profile === 'object') write(KEYS.profile, data.profile);
    if (data.prefs && typeof data.prefs === 'object') write(KEYS.prefs, data.prefs);
    return { importedSessions, importedFacts };
  }
  function getSession(id) {
    return getSessions().find(s => s.id === id) || null;
  }
  function createSession(title = 'Untitled session') {
    const sessions = read(KEYS.sessions, []);
    const session = {
      id: uid(),
      title,
      model: null,
      messages: [],
      summary: '',
      summaryThrough: 0,
      created: Date.now(),
      updated: Date.now(),
    };
    sessions.push(session);
    write(KEYS.sessions, sessions);
    setActiveId(session.id);
    return session;
  }
  function saveSession(session) {
    const sessions = read(KEYS.sessions, []);
    const idx = sessions.findIndex(s => s.id === session.id);
    session.updated = Date.now();
    if (idx >= 0) sessions[idx] = session; else sessions.push(session);
    write(KEYS.sessions, sessions);
  }
  function deleteSession(id) {
    write(KEYS.sessions, read(KEYS.sessions, []).filter(s => s.id !== id));
    if (getActiveId() === id) setActiveId(null);
  }
  function clearAll() {
    write(KEYS.sessions, []);
    write(KEYS.facts, []);
    write(KEYS.profile, { name: '', role: '', preferences: '' });
    setActiveId(null);
  }

  function getActiveId() { return read(KEYS.activeId, null); }
  function setActiveId(id) { write(KEYS.activeId, id); }

  // ---- Preferences ----
  function getPrefs() { return read(KEYS.prefs, { model: null, agentic: true, research: false, tools: true, runToCompletion: true }); }
  function savePrefs(prefs) { write(KEYS.prefs, prefs); }

  return {
    getFacts, addFact, removeFact, editFact, togglePinFact, autoExtract, factsAsSystemContext,
    recallFacts, recallPastMessages, recallContext,
    getConversationContext,
    getSessions, getSession, createSession, saveSession, deleteSession, clearAll,
    searchSessions, toggleStarSession,
    getProfile, saveProfile, profileAsSystemContext,
    exportBackup, importBackup,
    getActiveId, setActiveId, getPrefs, savePrefs,
    onStorageError,
  };
})();
