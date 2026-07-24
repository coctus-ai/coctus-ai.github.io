/**
 * models.js — provider-agnostic chat/model layer with two backends:
 *
 *  - Puter.js (https://js.puter.com/v2/): client-side, backend-free access
 *    to 500+ hosted models, auth via the user's own Puter account. No API
 *    key ever touches this file for this path.
 *
 *  - OpenRouter (https://openrouter.ai): one or more real API keys, read
 *    from `window.OPENROUTER_API_KEYS` (an array — set in key.js, which you
 *    edit locally; see key.js for setup + the security note on
 *    client-exposed keys). With multiple keys, requests round-robin across
 *    them, and any key that gets rate-limited (429) or runs out of quota
 *    (402) is automatically pulled out of rotation for a cooldown window
 *    while the others keep serving — a single key's 20-req/min or
 *    50-req/day ceiling then stops being a hard ceiling for the app.
 *    Talks directly to OpenRouter's OpenAI-compatible REST API over
 *    fetch()/SSE — no backend, no proxy, fully static.
 *
 * Both backends are optional independently: you can run with only Puter,
 * only OpenRouter, or both and switch per session. agent.js, tools.js, and
 * the rest of the app only ever call CoctusModels.chat()/listModels() and
 * don't know or care which backend is active.
 */

const CoctusModels = (() => {

  const PROVIDERS = { PUTER: 'puter', OPENROUTER: 'openrouter' };
  let provider = PROVIDERS.PUTER;

  // Curated fallback list for Puter, used if puter.ai.listModels() isn't reachable yet.
  const FALLBACK_MODELS = [
    { id: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6',    group: 'Anthropic' },
    { id: 'anthropic/claude-opus-4-8',    label: 'Claude Opus 4.8',      group: 'Anthropic' },
    { id: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5',     group: 'Anthropic' },
    { id: 'openai/gpt-5.5',               label: 'GPT-5.5',              group: 'OpenAI' },
    { id: 'gpt-5.4-nano',                 label: 'GPT-5.4 nano',         group: 'OpenAI' },
    { id: 'google/gemini-3.5-flash',      label: 'Gemini 3.5 Flash',     group: 'Google' },
    { id: 'x-ai/grok-4.3',                label: 'Grok 4.3',             group: 'xAI' },
    { id: 'deepseek-chat',                label: 'DeepSeek Chat',        group: 'DeepSeek' },
  ];

  const cachedModelsByProvider = {};

  function setProvider(p) {
    if (p !== PROVIDERS.PUTER && p !== PROVIDERS.OPENROUTER) return;
    provider = p;
  }
  function getProvider() { return provider; }

  /**
   * Key pool — supports 1..N OpenRouter keys (set `window.OPENROUTER_API_KEYS`
   * as an array in key.js; the older single `window.OPENROUTER_API_KEY` still
   * works and is folded in too). Rotates round-robin across keys on every
   * call to spread load, and reactively pulls a key out of rotation for a
   * cooldown window the moment IT specifically gets rate-limited (429) or
   * runs out of quota (402) — so one key's 20/min or 50-a-day ceiling doesn't
   * stall requests as long as another key in the pool still has headroom.
   */
  const KeyPool = (() => {
    let cursor = 0;
    const cooldownUntil = new Map(); // key -> epoch ms

    const LS_KEY = 'coctus_openrouter_keys_v1';

    function localKeys() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }

    function setLocalKeys(keys) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(keys.map(k => String(k || '').trim()).filter(Boolean))); } catch {}
    }

    function rawKeys() {
      const list = [];
      try {
        // Keys typed into the app (Settings → OpenRouter) come first — this
        // is the recommended path for a publicly-deployed copy (e.g. GitHub
        // Pages), since a localStorage entry never leaves the visitor's own
        // browser and is never part of the repo/page source, unlike key.js.
        list.push(...localKeys());
        if (Array.isArray(window.OPENROUTER_API_KEYS)) list.push(...window.OPENROUTER_API_KEYS);
        if (window.OPENROUTER_API_KEY) list.push(window.OPENROUTER_API_KEY);
      } catch {}
      return [...new Set(list.map(k => String(k || '').trim()).filter(Boolean))];
    }

    function all() { return rawKeys(); }
    function count() { return rawKeys().length; }
    function mask(key) { return key.length > 8 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '••••'; }

    /** Next key that isn't currently in cooldown, round-robin; falls back to the soonest-to-recover key if every key is cooling down. */
    function next() {
      const keys = rawKeys();
      if (!keys.length) return null;
      const now = Date.now();
      for (let i = 0; i < keys.length; i++) {
        const idx = (cursor + i) % keys.length;
        const k = keys[idx];
        const until = cooldownUntil.get(k) || 0;
        if (until <= now) { cursor = (idx + 1) % keys.length; return k; }
      }
      // Every key is cooling down — use whichever recovers soonest rather than hard-failing.
      let best = keys[0], bestUntil = cooldownUntil.get(keys[0]) || 0;
      for (const k of keys) {
        const u = cooldownUntil.get(k) || 0;
        if (u < bestUntil) { best = k; bestUntil = u; }
      }
      return best;
    }

    function cooldown(key, ms) { cooldownUntil.set(key, Date.now() + ms); }

    function status() {
      const now = Date.now();
      return rawKeys().map(k => {
        const until = cooldownUntil.get(k) || 0;
        const cooling = until > now;
        return { masked: mask(k), cooling, secondsLeft: cooling ? Math.ceil((until - now) / 1000) : 0 };
      });
    }

    return { all, count, next, cooldown, mask, status, localKeys, setLocalKeys };
  })();

  function openRouterKeyPresent() { return KeyPool.count() > 0; }
  function openRouterKeyPoolStatus() { return KeyPool.status(); }
  function getLocalOpenRouterKeys() { return KeyPool.localKeys(); }
  function setLocalOpenRouterKeys(keys) { KeyPool.setLocalKeys(keys); }

  // ---------------- model catalogue ----------------

  async function listModelsPuter() {
    try {
      if (window.puter && puter.ai && puter.ai.listModels) {
        const raw = await puter.ai.listModels();
        if (Array.isArray(raw) && raw.length) {
          return raw.map(m => ({
            id: m.id,
            label: m.name || m.id,
            group: (m.provider || 'other').replace(/^\w/, c => c.toUpperCase()),
          }));
        }
      }
    } catch (err) {
      console.warn('Coctus: Puter listModels() unavailable, using fallback list.', err);
    }
    return FALLBACK_MODELS;
  }

  /**
   * OpenRouter's /api/v1/models is public (no key required just to list).
   * "Free" here means genuinely $0 to use for chat — verified against
   * OpenRouter's own live collection (openrouter.ai/collections/free-models)
   * during development, which surfaced two real traps worth guarding
   * against in code, not just in a one-time list:
   *
   *  1. A model can have $0 prompt/completion pricing but still charge a
   *     non-zero flat `request` fee or per-`image` fee (OpenRouter's own
   *     "free" collection page currently includes a $0.04-per-image model
   *     for exactly this reason) — so all four price fields are checked,
   *     not just prompt/completion.
   *  2. Some $0-priced entries aren't chat models at all (rerank/embedding
   *     endpoints) and will simply fail against /chat/completions — filtered
   *     out by id pattern since they'd otherwise look "free" but be unusable.
   */
  const NON_CHAT_ID_PATTERN = /(rerank|embed|moderation|whisper|tts|text-to-speech|speech)/i;

  function isGenuinelyFreeChatModel(m) {
    const idFreeSuffix = typeof m.id === 'string' && m.id.endsWith(':free');
    const p = m.pricing || {};
    const isZero = (v) => v === '0' || v === 0 || v === undefined || v === null;
    const allPriceFieldsZero = isZero(p.prompt) && isZero(p.completion) && isZero(p.request) && isZero(p.image);
    if (!idFreeSuffix && !allPriceFieldsZero) return false;
    // Even a ":free" id is only trustworthy for chat if every price field is actually zero.
    if (!allPriceFieldsZero) return false;
    if (NON_CHAT_ID_PATTERN.test(m.id)) return false;
    return true;
  }

  async function listModelsOpenRouter() {
    const resp = await fetch('https://openrouter.ai/api/v1/models');
    if (!resp.ok) throw new Error(`OpenRouter models list failed with HTTP ${resp.status}`);
    const json = await resp.json();
    const all = Array.isArray(json.data) ? json.data : [];
    const free = all.filter(isGenuinelyFreeChatModel);
    return free
      .map(m => ({
        id: m.id,
        label: `${m.name || m.id}${m.context_length ? ` (${Math.round(m.context_length / 1000)}K ctx)` : ''}`,
        group: 'OpenRouter — Free · ' + (m.id.split('/')[0] || 'other').replace(/^\w/, c => c.toUpperCase()),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Ask the active provider for its live model catalogue (cached per-provider for the session). */
  async function listModels() {
    if (cachedModelsByProvider[provider]) return cachedModelsByProvider[provider];
    const models = provider === PROVIDERS.OPENROUTER ? await listModelsOpenRouter() : await listModelsPuter();
    cachedModelsByProvider[provider] = models;
    return models;
  }

  function isReady() {
    if (provider === PROVIDERS.OPENROUTER) return openRouterKeyPresent();
    return !!(window.puter && puter.ai && puter.ai.chat);
  }

  /**
   * Puter's built-in `web_search` tool (real, live search — not the model's
   * own training data) is currently only wired up for OpenAI-family models
   * on the Puter backend. OpenRouter models don't get this native toggle
   * here — they still get real, current information through Coctus's own
   * web_search/web_fetch/wikipedia *tools* (see tools.js), which work
   * identically regardless of provider.
   */
  function supportsWebSearch(modelId) {
    if (provider === PROVIDERS.OPENROUTER) return false;
    if (!modelId) return false;
    const id = modelId.toLowerCase();
    return id.startsWith('openai/') || id.startsWith('gpt-');
  }

  class CancelledError extends Error { constructor() { super('Cancelled by user'); this.name = 'CancelledError'; } }

  // A streaming call that has already emitted tokens can't be safely retried
  // (the caller would see duplicated output), so only non-streaming calls get
  // the automatic retry. One retry, short fixed backoff — this is meant to
  // absorb a transient network/provider hiccup, not mask a real outage.
  const RETRY_DELAY_MS = 900;

  async function chat(messages, opts = {}) {
    const p = opts.provider || provider;
    if (p === PROVIDERS.OPENROUTER) return chatOpenRouter(messages, opts);
    return chatPuter(messages, opts);
  }

  // ---------------- Puter backend ----------------

  async function chatPuter(messages, { model, onToken, temperature, webSearch, signal, _retried } = {}) {
    if (signal && signal.cancelled) throw new CancelledError();
    if (!(window.puter && puter.ai && puter.ai.chat)) {
      throw new Error('Puter.js has not loaded. Check your connection and reload the page.');
    }
    const opts = { model, stream: !!onToken };
    if (typeof temperature === 'number') opts.temperature = temperature;
    if (webSearch && supportsWebSearch(model)) opts.tools = [{ type: 'web_search' }];

    if (onToken) {
      const stream = await puter.ai.chat(messages, opts);
      let full = '';
      for await (const part of stream) {
        if (signal && signal.cancelled) throw new CancelledError();
        const chunk = extractText(part);
        if (chunk) {
          full += chunk;
          onToken(chunk, full);
        }
      }
      return full;
    }

    try {
      const response = await puter.ai.chat(messages, opts);
      if (signal && signal.cancelled) throw new CancelledError();
      const text = extractText(response) || fallbackStringify(response);
      if (!text.trim() && !_retried) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return chatPuter(messages, { model, temperature, webSearch, signal, _retried: true });
      }
      return text;
    } catch (err) {
      if (err instanceof CancelledError || (signal && signal.cancelled)) throw new CancelledError();
      if (_retried) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      if (signal && signal.cancelled) throw new CancelledError();
      return chatPuter(messages, { model, temperature, webSearch, signal, _retried: true });
    }
  }

  /** Puter's response shapes vary a bit by model/provider — normalize them. */
  function extractText(resp) {
    if (!resp) return '';
    if (typeof resp === 'string') return resp;
    if (typeof resp.text === 'string') return resp.text;
    if (resp.message && resp.message.content) {
      const c = resp.message.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        return c.filter(b => b.type === 'text' || b.text).map(b => b.text || '').join('');
      }
    }
    if (Array.isArray(resp.content)) {
      return resp.content.filter(b => b.type === 'text' || b.text).map(b => b.text || '').join('');
    }
    return '';
  }

  function fallbackStringify(resp) {
    try { return typeof resp === 'string' ? resp : JSON.stringify(resp); }
    catch { return String(resp); }
  }

  // ---------------- OpenRouter backend ----------------

  const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const KEY_COOLDOWN_429_MS = 65 * 1000;       // a bit over the 1-minute window a 429 implies
  const KEY_COOLDOWN_402_MS = 60 * 60 * 1000;  // 402 usually means daily quota — cool down for an hour rather than hammer it

  function openRouterHeaders(key) {
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Recommended (not required) by OpenRouter for their public leaderboards/analytics.
      'HTTP-Referer': (typeof location !== 'undefined' && location.href) || 'https://coctus.local',
      'X-Title': 'Coctus AI',
    };
  }

  /**
   * Converts Coctus's {role, content} messages (content may be a string or a
   * vision content-block array) into OpenAI/OpenRouter wire format — already
   * compatible as-is.
   *
   * Key rotation happens here, per attempt: a 429/402 never reaches the
   * caller as long as at least one other key in the pool has headroom — it
   * transparently retries with the next key instead. This is safe to do even
   * for a streaming call, because a 429/402 always comes back on the initial
   * response (before any body bytes/SSE chunks are read), so nothing has
   * been shown to the user yet to make retrying unsafe.
   */
  async function chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens, _attempt } = {}) {
    const attempt = _attempt || 0;
    if (signal && signal.cancelled) throw new CancelledError();
    if (!openRouterKeyPresent()) {
      throw new Error('No OpenRouter API key found. Add one (or up to 5, for automatic rotation) in key.js — window.OPENROUTER_API_KEYS = ["sk-or-...", ...] — or get a free key at https://openrouter.ai/keys');
    }
    const key = KeyPool.next();
    const body = { model, messages, stream: !!onToken };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (maxTokens) body.max_tokens = maxTokens;

    let resp;
    try {
      resp = await fetch(OPENROUTER_URL, { method: 'POST', headers: openRouterHeaders(key), body: JSON.stringify(body) });
    } catch (err) {
      throw new Error(`Could not reach OpenRouter (network error): ${err.message}`);
    }
    if (signal && signal.cancelled) throw new CancelledError();

    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try { const errJson = await resp.json(); if (errJson?.error?.message) detail = errJson.error.message; } catch {}

      const isRateLimit = resp.status === 429;
      const isQuota = resp.status === 402;
      const poolSize = KeyPool.count();
      const canRotate = (isRateLimit || isQuota) && attempt < poolSize - 1 && poolSize > 1;

      if (isRateLimit) KeyPool.cooldown(key, KEY_COOLDOWN_429_MS);
      if (isQuota) KeyPool.cooldown(key, KEY_COOLDOWN_402_MS);

      if (canRotate) {
        return chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens, _attempt: attempt + 1 });
      }

      if (isRateLimit) {
        detail += poolSize > 1
          ? ` — all ${poolSize} of your OpenRouter keys are currently rate-limited (20 req/min per key). Try again shortly.`
          : ' — free OpenRouter models are capped at 20 requests/minute, and 50/day unless you\'ve ever added $10+ in credits (then 1000/day). Wait a bit, switch models, add credits, or add more keys to key.js for automatic rotation.';
      } else if (isQuota) {
        detail += poolSize > 1
          ? ` — all ${poolSize} of your OpenRouter keys are out of quota for this model right now.`
          : ' — this model needs OpenRouter credits (it may not actually be free, or your free quota is exhausted). Double-check it\'s in the free list, add credits, or add more keys to key.js.';
      }
      // Non-key-exhaustion transient errors (5xx) still get one plain retry, same key.
      if (!onToken && !isRateLimit && !isQuota && attempt === 0 && resp.status >= 500) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        if (signal && signal.cancelled) throw new CancelledError();
        return chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens, _attempt: attempt + 1 });
      }
      throw new Error(`OpenRouter error: ${detail}`);
    }

    if (!onToken) {
      const json = await resp.json();
      if (signal && signal.cancelled) throw new CancelledError();
      const text = json?.choices?.[0]?.message?.content || '';
      if (!text.trim() && attempt === 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens, _attempt: attempt + 1 });
      }
      return text;
    }

    // ---- Streaming: OpenAI-compatible SSE, "data: {...}\n\n" chunks, ending in "data: [DONE]" ----
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    while (true) {
      if (signal && signal.cancelled) { try { await reader.cancel(); } catch {} throw new CancelledError(); }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep the last (possibly incomplete) line for the next chunk
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt?.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onToken(delta, full); }
        } catch {
          // Some providers occasionally emit a non-JSON keep-alive comment line — ignore it.
        }
      }
    }
    return full;
  }

  // ---------------- native tool/function calling (OpenRouter only) ----------------
  // OpenAI-compatible `tools` param: lets the model return a structured
  // tool_calls array instead of us having to parse "TOOL_CALL: {...}" out of
  // free text. Two big wins over the text protocol: (1) no ambiguity — a
  // tool call can never be confused with prose, so the real answer streams
  // to the screen in real time with no buffering trick needed; (2) more
  // reliable across models that are actually trained for function calling.
  // Not every free OpenRouter model supports it, so this remembers (for the
  // session) which model ids reject the `tools` param and transparently
  // falls back to the plain text protocol for those going forward — see
  // agent.js's reactLoop, which checks hasNoToolSupport() before choosing
  // the native vs. text-protocol path.
  const noToolSupport = new Set();
  function hasNoToolSupport(model) { return noToolSupport.has(model); }

  function normalizeToolCalls(raw) {
    if (!raw || !raw.length) return null;
    const out = raw.map(tc => {
      const fn = tc.function || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }
      return { id: tc.id || '', name: fn.name || '', args };
    }).filter(tc => tc.name);
    return out.length ? out : null;
  }

  async function chatOpenRouterWithTools(messages, { model, tools, onToken, temperature, signal, maxTokens, _attempt } = {}) {
    const attempt = _attempt || 0;
    if (signal && signal.cancelled) throw new CancelledError();
    if (noToolSupport.has(model)) {
      const text = await chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens });
      return { text, toolCalls: null };
    }
    if (!openRouterKeyPresent()) {
      throw new Error('No OpenRouter API key found. Add one (or up to 5, for automatic rotation) in key.js — window.OPENROUTER_API_KEYS = ["sk-or-...", ...] — or get a free key at https://openrouter.ai/keys');
    }
    const key = KeyPool.next();
    const body = { model, messages, stream: !!onToken, tools, tool_choice: 'auto' };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (maxTokens) body.max_tokens = maxTokens;

    let resp;
    try {
      resp = await fetch(OPENROUTER_URL, { method: 'POST', headers: openRouterHeaders(key), body: JSON.stringify(body) });
    } catch (err) {
      throw new Error(`Could not reach OpenRouter (network error): ${err.message}`);
    }
    if (signal && signal.cancelled) throw new CancelledError();

    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      let errMsg = '';
      try { const errJson = await resp.json(); errMsg = errJson?.error?.message || ''; if (errMsg) detail = errMsg; } catch {}

      // Model/provider doesn't support function calling at all — remember
      // that and fall back to the text protocol, for this call and every
      // one after it this session (see hasNoToolSupport above).
      if (resp.status === 400 && /tool|function[_ ]calling/i.test(errMsg)) {
        noToolSupport.add(model);
        const text = await chatOpenRouter(messages, { model, onToken, temperature, signal, maxTokens });
        return { text, toolCalls: null };
      }

      const isRateLimit = resp.status === 429;
      const isQuota = resp.status === 402;
      const poolSize = KeyPool.count();
      const canRotate = (isRateLimit || isQuota) && attempt < poolSize - 1 && poolSize > 1;
      if (isRateLimit) KeyPool.cooldown(key, KEY_COOLDOWN_429_MS);
      if (isQuota) KeyPool.cooldown(key, KEY_COOLDOWN_402_MS);
      if (canRotate) return chatOpenRouterWithTools(messages, { model, tools, onToken, temperature, signal, maxTokens, _attempt: attempt + 1 });
      if (!onToken && !isRateLimit && !isQuota && attempt === 0 && resp.status >= 500) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        if (signal && signal.cancelled) throw new CancelledError();
        return chatOpenRouterWithTools(messages, { model, tools, onToken, temperature, signal, maxTokens, _attempt: attempt + 1 });
      }
      throw new Error(`OpenRouter error: ${detail}`);
    }

    if (!onToken) {
      const json = await resp.json();
      if (signal && signal.cancelled) throw new CancelledError();
      const msg = json?.choices?.[0]?.message || {};
      return { text: msg.content || '', toolCalls: normalizeToolCalls(msg.tool_calls) };
    }

    // ---- Streaming: content deltas AND tool_call deltas (accumulated by index) ----
    // Content is buffered locally rather than forwarded to onToken immediately:
    // some function-calling models emit a short lead-in ("Let me check that...")
    // as `content` in the SAME turn as `tool_calls`, and forwarding it live
    // would flash that preamble on screen only to have it replaced once the
    // tool call resolves. Content is only revealed once it's long enough (or
    // hits a newline) with no tool_call delta seen yet — the same reveal
    // trick used on the text protocol, but driven by real structured signal
    // (an actual tool_call delta) instead of a regex guess.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '', revealed = false, sawToolCall = false;
    const toolCallsAcc = [];
    while (true) {
      if (signal && signal.cancelled) { try { await reader.cancel(); } catch {} throw new CancelledError(); }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt?.choices?.[0]?.delta || {};
          if (Array.isArray(delta.tool_calls)) {
            sawToolCall = true;
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
              if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: '', function: { name: '', arguments: '' } };
              if (tc.id) toolCallsAcc[idx].id = tc.id;
              if (tc.function && tc.function.name) toolCallsAcc[idx].function.name += tc.function.name;
              if (tc.function && tc.function.arguments) toolCallsAcc[idx].function.arguments += tc.function.arguments;
            }
          }
          if (delta.content && !sawToolCall) {
            full += delta.content;
            if (revealed) { onToken(delta.content, full); }
            else if (full.length >= 24 || /\n/.test(full)) { revealed = true; onToken(full, full); }
          }
        } catch {}
      }
    }
    if (!revealed && !sawToolCall && full) onToken(full, full); // short answer that never crossed the reveal threshold
    return { text: full, toolCalls: normalizeToolCalls(toolCallsAcc.filter(Boolean)) };
  }

  /**
   * Preferred entry point for tool-enabled turns: returns { text, toolCalls }.
   * Uses native OpenRouter function calling when available; otherwise (Puter,
   * or an OpenRouter model that rejected `tools`) transparently degrades to
   * a plain chat() call with toolCalls: null, so callers (agent.js) can
   * always branch on `toolCalls` without caring which path was actually used.
   */
  async function chatTool(messages, opts = {}) {
    const p = opts.provider || provider;
    if (p === PROVIDERS.OPENROUTER && opts.tools && opts.tools.length && !noToolSupport.has(opts.model)) {
      return chatOpenRouterWithTools(messages, opts);
    }
    const text = await chat(messages, { ...opts, tools: undefined });
    return { text, toolCalls: null };
  }




  // ---------------- text-to-speech ----------------
  // Puter's hosted txt2speech only exists as a Puter feature — it has
  // nothing to do with which CHAT provider is selected. The real bug
  // (found by testing): checking only "is the SDK loaded and does the
  // function exist" was NOT enough to know it would actually work —
  // calling puter.ai.txt2speech() while not signed in doesn't reject with
  // an error, it silently kicks off Puter's own sign-in flow instead. That
  // meant clicking "Listen" while using OpenRouter (and never having
  // signed into Puter) looked like it "went to puter.com to log in"
  // instead of just reading the reply aloud — because that's exactly what
  // was happening, and our try/catch fallback never even got a chance to
  // run since nothing had thrown yet.
  // Fixed by gating Puter TTS on an ACTUAL signed-in session
  // (puter.auth.isSignedIn()), not just SDK presence. If that's not true,
  // we skip straight to the browser's own native speechSynthesis — no
  // account, no popup, no network call, works regardless of chat provider.
  function puterTtsAvailable() {
    return !!(
      window.puter && puter.ai && puter.ai.txt2speech &&
      puter.auth && typeof puter.auth.isSignedIn === 'function' && puter.auth.isSignedIn()
    );
  }
  function browserTtsAvailable() {
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }
  function ttsAvailable() {
    return puterTtsAvailable() || browserTtsAvailable();
  }

  /**
   * Wraps the browser's speechSynthesis in a tiny HTMLAudioElement-like
   * handle — .play()/.pause(), a .paused flag, and 'play'/'pause'/'ended'
   * events — so the UI can drive it exactly like the object Puter's
   * txt2speech returns, with no branching needed on the calling side.
   */
  function browserSpeechHandle(text) {
    const synth = window.speechSynthesis;
    let utterance = null;
    const listeners = { play: [], pause: [], ended: [] };
    const fire = (evt) => listeners[evt].forEach((cb) => { try { cb(); } catch {} });
    const handle = {
      paused: true,
      addEventListener(evt, cb) { if (listeners[evt]) listeners[evt].push(cb); },
      play() {
        if (utterance && synth.paused) { synth.resume(); handle.paused = false; fire('play'); return; }
        synth.cancel();
        utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => { handle.paused = false; fire('play'); };
        utterance.onend = () => { handle.paused = true; fire('ended'); };
        utterance.onerror = () => { handle.paused = true; fire('ended'); };
        synth.speak(utterance);
      },
      pause() {
        if (synth.speaking && !synth.paused) { synth.pause(); handle.paused = true; fire('pause'); }
      },
    };
    return handle;
  }

  async function speak(text) {
    const clean = String(text || '').replace(/```[\s\S]*?```/g, ' code block omitted ').slice(0, 3000);
    if (!clean.trim()) throw new Error('Nothing to read aloud.');
    if (puterTtsAvailable()) {
      try { return await puter.ai.txt2speech(clean); }
      catch (err) {
        console.warn('Coctus: Puter text-to-speech failed (likely not signed in) — falling back to the browser voice.', err);
        if (!browserTtsAvailable()) throw err;
      }
    }
    if (browserTtsAvailable()) return browserSpeechHandle(clean);
    throw new Error('Text-to-speech is not available — this browser has no speech synthesis support, and Puter.js has not loaded either.');
  }

  return {
    PROVIDERS, setProvider, getProvider,
    openRouterKeyPresent, openRouterKeyPoolStatus, getLocalOpenRouterKeys, setLocalOpenRouterKeys,
    listModels, chat, chatTool, hasNoToolSupport, isReady, supportsWebSearch, FALLBACK_MODELS, CancelledError,
    ttsAvailable, speak,
  };
})();
