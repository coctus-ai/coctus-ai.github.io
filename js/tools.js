/**
 * tools.js — Coctus's actual tool registry. This is what turns the agent
 * loop from "reasons in text" into "can act": fetch a real page, run real
 * JS, run real Python. Everything executes client-side:
 *  - web_fetch reads a URL via the Jina AI Reader proxy (r.jina.ai), which
 *    returns clean readable text/markdown and is CORS-friendly from a
 *    static page — there's no backend here to do a plain server-side fetch.
 *  - web_search runs a real DuckDuckGo query through that same proxy, so
 *    Coctus can look things up on ANY model, not only the OpenAI-family
 *    models Puter wires a native search tool up for.
 *  - js_exec runs in a fresh Web Worker: separate thread, no DOM/window/
 *    localStorage access, hard-killed on timeout. Safer than eval() in the
 *    page itself, though not a full OS-level sandbox — treat it the way
 *    you'd treat any local code-execution tool.
 *  - py_exec runs in a Web Worker via Pyodide (CPython compiled to WASM),
 *    lazily loaded on first use.
 *  - calculator is a restricted arithmetic-only evaluator for quick math
 *    the model shouldn't "reason" its way through by hand.
 */

const CoctusTools = (() => {

  const EXEC_TIMEOUT_MS = 8000;
  const FETCH_TIMEOUT_MS = 15000;
  const MAX_FETCH_CHARS = 20000;

  // ---------------- web_fetch ----------------
  async function webFetch(args) {
    const url = (args && args.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'url must start with http:// or https://' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      // Jina AI Reader: a free, CORS-open "read this URL as clean text" proxy,
      // purpose-built for feeding pages to LLMs. No key needed for light use.
      const resp = await fetch('https://r.jina.ai/' + url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, error: `Fetch failed with HTTP ${resp.status}` };
      let text = await resp.text();
      let truncated = false;
      if (text.length > MAX_FETCH_CHARS) { text = text.slice(0, MAX_FETCH_CHARS); truncated = true; }
      return { ok: true, result: text + (truncated ? '\n\n[...content truncated...]' : '') };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') return { ok: false, error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
      return { ok: false, error: `Fetch error: ${err.message}` };
    }
  }

  // ---------------- web_search ----------------
  // Works on ANY model (not just OpenAI-family, which is the only family
  // Puter wires a native search tool up for). Goes through the same Jina
  // Reader proxy used by web_fetch, pointed at DuckDuckGo's HTML results
  // page, so it needs no API key and stays CORS-friendly from a static site.
  async function webSearch(args) {
    const query = String(args && args.query || '').trim();
    if (!query) return { ok: false, error: 'query must not be empty' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const target = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query);
      const resp = await fetch('https://r.jina.ai/' + target, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, error: `Search failed with HTTP ${resp.status}` };
      let text = await resp.text();
      if (text.length > MAX_FETCH_CHARS) text = text.slice(0, MAX_FETCH_CHARS);
      if (!text.trim()) return { ok: false, error: 'search returned no readable content' };
      return { ok: true, result: text };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') return { ok: false, error: `Search timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
      return { ok: false, error: `Search error: ${err.message}` };
    }
  }

  // ---------------- calculator ----------------
  function calculator(args) {
    const expr = String(args && args.expression || '');
    if (!/^[0-9+\-*/%^()., \te]+$/i.test(expr) || expr.length > 200) {
      return { ok: false, error: 'expression must be plain arithmetic only (digits, + - * / % ^ ( ) .)' };
    }
    try {
      const safe = expr.replace(/\^/g, '**');
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${safe});`)();
      if (typeof value !== 'number' || !isFinite(value)) return { ok: false, error: 'expression did not evaluate to a finite number' };
      return { ok: true, result: String(value) };
    } catch (err) {
      return { ok: false, error: `Could not evaluate: ${err.message}` };
    }
  }

  // ---------------- js_exec (Web Worker sandbox) ----------------
  const JS_WORKER_SRC = `
    self.onmessage = function (e) {
      const code = e.data;
      const logs = [];
      const origLog = console.log;
      console.log = function (...args) {
        logs.push(args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' '));
      };
      try {
        const result = (0, eval)(code);
        let resultStr;
        try { resultStr = typeof result === 'undefined' ? undefined : (typeof result === 'string' ? result : JSON.stringify(result, null, 2)); }
        catch { resultStr = String(result); }
        self.postMessage({ ok: true, result: resultStr, logs });
      } catch (err) {
        self.postMessage({ ok: false, error: (err && err.message) || String(err), logs });
      }
    };
  `;

  function runInWorker(workerSrc, payload, timeoutMs) {
    return new Promise((resolve) => {
      let worker;
      const blob = new Blob([workerSrc], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        worker = new Worker(blobUrl);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        resolve({ ok: false, error: `Could not start sandbox worker: ${err.message}` });
        return;
      }
      // The worker has the script content by the time it's constructed —
      // revoking now (rather than never) is what stops every code
      // execution from permanently leaking a blob URL for the tab's
      // whole lifetime.
      URL.revokeObjectURL(blobUrl);
      const timer = setTimeout(() => {
        try { worker.terminate(); } catch {}
        resolve({ ok: false, error: `Execution timed out after ${timeoutMs}ms (possible infinite loop)` });
      }, timeoutMs);
      worker.onmessage = (e) => { clearTimeout(timer); try { worker.terminate(); } catch {} resolve(e.data); };
      worker.onerror = (e) => { clearTimeout(timer); try { worker.terminate(); } catch {} resolve({ ok: false, error: e.message || 'worker error' }); };
      worker.postMessage(payload);
    });
  }

  async function jsExec(args) {
    const code = String(args && args.code || '');
    if (!code.trim()) return { ok: false, error: 'no code provided' };
    const out = await runInWorker(JS_WORKER_SRC, code, EXEC_TIMEOUT_MS);
    return formatExecResult(out);
  }

  // ---------------- py_exec (Pyodide in a Web Worker) ----------------
  const PY_WORKER_SRC = `
    self.pyodideReadyPromise = null;
    async function ensurePyodide() {
      if (self.pyodideReadyPromise) return self.pyodideReadyPromise;
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');
      self.pyodideReadyPromise = loadPyodide();
      return self.pyodideReadyPromise;
    }
    self.onmessage = async function (e) {
      const code = e.data;
      try {
        const pyodide = await ensurePyodide();
        let out = '';
        pyodide.setStdout({ batched: (s) => { out += s + '\\n'; } });
        pyodide.setStderr({ batched: (s) => { out += s + '\\n'; } });
        let result;
        try { result = await pyodide.runPythonAsync(code); } catch (err) {
          self.postMessage({ ok: false, error: String(err), logs: out ? [out] : [] });
          return;
        }
        const resultStr = (typeof result === 'undefined' || result === null) ? undefined : String(result);
        self.postMessage({ ok: true, result: resultStr, logs: out ? [out] : [] });
      } catch (err) {
        self.postMessage({ ok: false, error: 'Pyodide failed to load or run: ' + (err && err.message || String(err)) });
      }
    };
  `;

  async function pyExec(args) {
    const code = String(args && args.code || '');
    if (!code.trim()) return { ok: false, error: 'no code provided' };
    // First run per session lazily downloads ~10MB of WASM — give it real headroom.
    const out = await runInWorker(PY_WORKER_SRC, code, 45000);
    return formatExecResult(out);
  }

  function formatExecResult(out) {
    if (!out) return { ok: false, error: 'no response from sandbox' };
    if (!out.ok) return { ok: false, error: out.error || 'execution error', logs: out.logs || [] };
    const parts = [];
    if (out.logs && out.logs.length) parts.push(out.logs.join('\n'));
    if (typeof out.result !== 'undefined') parts.push(`=> ${out.result}`);
    return { ok: true, result: parts.join('\n') || '(no output)' };
  }

  // ---------------- wikipedia ----------------
  // Wikipedia's own REST/action APIs are CORS-open with origin=*, so this
  // needs no proxy at all — more reliable than the Jina-proxied DuckDuckGo
  // search above, and a good first stop for factual/encyclopedic lookups.
  async function wikipedia(args) {
    const query = String(args && args.query || '').trim();
    if (!query) return { ok: false, error: 'query must not be empty' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`;
      const searchResp = await fetch(searchUrl, { signal: controller.signal });
      const searchJson = await searchResp.json();
      const hits = (searchJson.query && searchJson.query.search) || [];
      if (!hits.length) { clearTimeout(timer); return { ok: false, error: 'no Wikipedia article found for that query' }; }
      const title = hits[0].title;
      const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      const sumResp = await fetch(sumUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!sumResp.ok) return { ok: false, error: `Wikipedia summary fetch failed with HTTP ${sumResp.status}` };
      const sum = await sumResp.json();
      const related = hits.slice(1).map(h => h.title).join(', ');
      const text = `# ${sum.title}\n${sum.description ? '_' + sum.description + '_\n' : ''}\n${sum.extract || ''}\n\nSource: ${sum.content_urls?.desktop?.page || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')))}` +
        (related ? `\n\nOther matching articles: ${related}` : '');
      return { ok: true, result: text };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') return { ok: false, error: `Wikipedia lookup timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
      return { ok: false, error: `Wikipedia lookup error: ${err.message}` };
    }
  }

  // ---------------- weather ----------------
  // Open-Meteo: free, no API key, CORS-open geocoding + forecast endpoints.
  async function weather(args) {
    const place = String(args && args.location || '').trim();
    if (!place) return { ok: false, error: 'location must not be empty' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`;
      const geoResp = await fetch(geoUrl, { signal: controller.signal });
      const geoJson = await geoResp.json();
      const loc = geoJson.results && geoJson.results[0];
      if (!loc) { clearTimeout(timer); return { ok: false, error: `could not find a location matching "${place}"` }; }
      const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4`;
      const fResp = await fetch(fUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!fResp.ok) return { ok: false, error: `forecast fetch failed with HTTP ${fResp.status}` };
      const f = await fResp.json();
      const c = f.current || {};
      const codeMap = { 0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 51: 'light drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 95: 'thunderstorm' };
      const desc = (code) => codeMap[code] || `condition code ${code}`;
      let out = `Current weather for ${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}, ${loc.country} (${f.timezone}):\n` +
        `${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), ${desc(c.weather_code)}, wind ${c.wind_speed_10m} km/h, precipitation ${c.precipitation}mm.\n\nNext days:\n`;
      (f.daily?.time || []).forEach((d, i) => {
        out += `- ${d}: ${desc(f.daily.weather_code[i])}, ${f.daily.temperature_2m_min[i]}–${f.daily.temperature_2m_max[i]}°C\n`;
      });
      return { ok: true, result: out.trim() };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') return { ok: false, error: `Weather lookup timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
      return { ok: false, error: `Weather lookup error: ${err.message}` };
    }
  }

  // ---------------- json_query ----------------
  // Validates JSON and optionally extracts a value at a dot/bracket path,
  // e.g. "results[0].name" — cheaper and more exact than asking the model
  // to hand-parse a big JSON blob out of a tool result.
  function jsonQuery(args) {
    const raw = String(args && args.json || '');
    const path = String(args && args.path || '').trim();
    let data;
    try { data = JSON.parse(raw); } catch (err) { return { ok: false, error: `invalid JSON: ${err.message}` }; }
    if (!path) return { ok: true, result: JSON.stringify(data, null, 2).slice(0, 4000) };
    try {
      let cur = data;
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
      for (const p of parts) {
        if (cur == null) break;
        cur = cur[p];
      }
      if (typeof cur === 'undefined') return { ok: false, error: `path "${path}" did not resolve to a value` };
      return { ok: true, result: typeof cur === 'string' ? cur : JSON.stringify(cur, null, 2) };
    } catch (err) {
      return { ok: false, error: `could not resolve path: ${err.message}` };
    }
  }

  // ---------------- image_gen ----------------
  // Uses Puter.js's hosted text-to-image model (puter.ai.txt2img) — same
  // no-backend, no-API-key model as chat. Returns a real, usable image URL
  // (or a data: URL, depending on Puter's response shape) that the model
  // can drop straight into a markdown ![]() so it renders inline in chat.
  async function imageGen(args) {
    const prompt = String(args && args.prompt || '').trim();
    if (!prompt) return { ok: false, error: 'prompt must not be empty' };
    if (!(window.puter && puter.ai && puter.ai.txt2img)) {
      return { ok: false, error: 'image generation is unavailable — Puter.js has not loaded or does not expose txt2img in this environment' };
    }
    try {
      const out = await puter.ai.txt2img(prompt);
      let url = null;
      if (typeof out === 'string') url = out;
      else if (out instanceof HTMLImageElement) url = out.src;
      else if (out && out.src) url = out.src;
      else if (out && out.url) url = out.url;
      if (!url) return { ok: false, error: 'image model returned an unrecognized response shape' };
      return { ok: true, result: `Image generated. Embed it in your answer as: ![${prompt.slice(0, 80)}](${url})`, imageUrl: url };
    } catch (err) {
      return { ok: false, error: `image generation failed: ${err.message || err}` };
    }
  }

  // ---------------- cert_transparency ----------------
  // Passive recon: queries crt.sh's public Certificate Transparency log
  // search to list subdomains/hostnames that have ever had a TLS cert
  // issued for them. Entirely passive (no requests ever touch the target
  // itself) — the standard first step of subdomain enumeration in
  // legitimate, authorized security research and bug bounty recon.
  async function certTransparency(args) {
    const domain = String(args && args.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return { ok: false, error: 'domain must be a bare domain like "example.com"' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, error: `crt.sh returned HTTP ${resp.status} (it's a public service and occasionally slow/rate-limited — try again shortly)` };
      const rows = await resp.json();
      if (!Array.isArray(rows) || !rows.length) return { ok: true, result: `No certificate-transparency records found for ${domain}.` };
      const names = new Set();
      for (const row of rows) {
        String(row.name_value || '').split('\n').forEach(n => { if (n) names.add(n.trim().toLowerCase()); });
      }
      const sorted = [...names].sort();
      const capped = sorted.slice(0, 300);
      return {
        ok: true,
        result: `${sorted.length} unique hostname(s) found for ${domain} via certificate transparency (passive — no requests sent to the target):\n`
          + capped.join('\n')
          + (sorted.length > capped.length ? `\n[...${sorted.length - capped.length} more truncated...]` : ''),
      };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') return { ok: false, error: `crt.sh request timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
      return { ok: false, error: `crt.sh request failed: ${err.message}` };
    }
  }

  // ---------------- write_file / read_file / list_files ----------------
  // The virtual project workspace (see workspace.js) — use this instead of
  // just putting code in the reply whenever the task is actually "a
  // project" (more than one related file, or something meant to be
  // downloaded/run as a whole) rather than a single explanatory snippet.
  function writeFile(args) {
    const path = String(args && args.path || '').trim();
    if (!path) return { ok: false, error: 'path is required, e.g. "src/App.jsx"' };
    const content = String((args && args.content) ?? '');
    const res = CoctusWorkspace.writeFile(path, content);
    if (!res.ok) return res;
    return { ok: true, result: `Wrote ${content.length} byte(s) to ${res.path}. Project now has ${CoctusWorkspace.fileCount()} file(s): ${CoctusWorkspace.listFiles().map(f => f.path).join(', ')}` };
  }

  function readFile(args) {
    const path = String(args && args.path || '').trim();
    if (!path) return { ok: false, error: 'path is required' };
    const content = CoctusWorkspace.readFile(path);
    if (content === null) return { ok: false, error: `no file at "${path}" in the current project — check list_files` };
    return { ok: true, result: content };
  }

  function listFiles() {
    const files = CoctusWorkspace.listFiles();
    if (!files.length) return { ok: true, result: '(project is empty — no files written yet)' };
    return { ok: true, result: files.map(f => `${f.path} (${f.size} bytes)`).join('\n') };
  }

  // ---------------- datetime ----------------
  // Trivial but important: without this, models silently guess "today's
  // date" from training data (often wrong by months). Free, instant, no
  // network call needed.
  function datetime() {
    const now = new Date();
    return {
      ok: true,
      result: `Current date/time: ${now.toString()}\nISO: ${now.toISOString()}\nUnix (seconds): ${Math.floor(now.getTime() / 1000)}`,
    };
  }

  // ---------------- scratchpad ----------------
  // A tiny persistent key/value working-memory the agent can write to and
  // read back across steps/tool-calls — useful for multi-step plans where
  // a fact found in step 1 needs to survive into step 3 without being
  // re-derived or re-fetched. In-memory Map (cleared via action:"clear"),
  // intentionally NOT localStorage — this is short-lived scratch working
  // memory, not long-term memory (see memory.js for that).
  const scratchStore = new Map();

  function scratchpad(args) {
    const action = String(args && args.action || 'get').toLowerCase();
    if (action === 'set') {
      const key = String(args && args.key || '').trim();
      if (!key) return { ok: false, error: 'action "set" requires a non-empty "key"' };
      scratchStore.set(key, String((args && args.value) ?? ''));
      return { ok: true, result: `Saved "${key}" to the scratchpad.` };
    }
    if (action === 'clear') {
      scratchStore.clear();
      return { ok: true, result: 'Scratchpad cleared.' };
    }
    if (action === 'list') {
      if (!scratchStore.size) return { ok: true, result: '(scratchpad is empty)' };
      return { ok: true, result: [...scratchStore.keys()].map(k => `- ${k}`).join('\n') };
    }
    const key = String(args && args.key || '').trim();
    if (!key) {
      if (!scratchStore.size) return { ok: true, result: '(scratchpad is empty)' };
      return { ok: true, result: [...scratchStore.entries()].map(([k, v]) => `${k}: ${v}`).join('\n') };
    }
    if (!scratchStore.has(key)) return { ok: false, error: `no scratchpad entry for "${key}"` };
    return { ok: true, result: scratchStore.get(key) };
  }

  // ---------------- registry ----------------
  const REGISTRY = {
    web_fetch: {
      run: webFetch,
      describe: 'web_fetch(url) — fetch a real web page and return its readable text content. Use for anything current, or any URL the user gives you.',
    },
    web_search: {
      run: webSearch,
      describe: 'web_search(query) — run a real live web search and return a page of results (titles, snippets, links) as text. Use this whenever you need current information, facts you are not certain of, or don\'t know a specific URL to web_fetch. Follow up with web_fetch on a promising result link when you need the full page.',
    },
    wikipedia: {
      run: wikipedia,
      describe: 'wikipedia(query) — look up an encyclopedic summary directly from Wikipedia (no proxy, very reliable). Prefer this over web_search for definitions, history, biographies, and background on well-established topics.',
    },
    weather: {
      run: weather,
      describe: 'weather(location) — get real current weather + a short forecast for a place name (city, region, landmark). Use whenever the user asks about weather, or a plan depends on it.',
    },
    calculator: {
      run: calculator,
      describe: 'calculator(expression) — evaluate plain arithmetic exactly, no rounding mistakes. Use for anything beyond trivial mental math.',
    },
    json_query: {
      run: jsonQuery,
      describe: 'json_query(json, path?) — validate a JSON string and optionally extract a value at a path like "results[0].name". Use this on JSON you got from another tool instead of hand-parsing it.',
    },
    js_exec: {
      run: jsExec,
      describe: 'js_exec(code) — run JavaScript in an isolated sandbox and return console output plus the last expression\'s value. Use to actually verify logic, transform data, or compute something instead of guessing.',
    },
    py_exec: {
      run: pyExec,
      describe: 'py_exec(code) — run Python (via Pyodide/WASM, standard library only, no pip installs) in an isolated sandbox and return stdout plus the final expression\'s value. First call in a session is slower (~10MB runtime download).',
    },
    image_gen: {
      run: imageGen,
      describe: 'image_gen(prompt) — generate a real image from a text description and get back a usable URL. Embed the returned URL in your final answer with markdown ![alt](url) syntax so it renders inline. Use only when the user actually wants an image, not for decoration.',
    },
    cert_transparency: {
      run: certTransparency,
      describe: 'cert_transparency(domain) — passive subdomain/hostname enumeration via crt.sh public Certificate Transparency logs. No request ever touches the target itself. Use as the first step of recon on a domain you\'re authorized to test.',
    },
    write_file: {
      run: writeFile,
      describe: 'write_file(path, content) — write a full file into the current virtual PROJECT (e.g. "src/App.jsx", "app/build.gradle.kts"). Use this instead of a plain code block whenever the task is actually a multi-file project rather than a single explanatory snippet — the user gets a real file tree they can browse and download as one .zip. Overwrites if the path already exists.',
    },
    read_file: {
      run: readFile,
      describe: 'read_file(path) — read back a file you (or an earlier step) already wrote to the project, to check or build on it.',
    },
    list_files: {
      run: listFiles,
      describe: 'list_files() — list every file currently in the project workspace, with sizes.',
    },
    datetime: {
      run: datetime,
      describe: 'datetime() — get the real current date and time. Always use this instead of guessing "today\'s date" from training data, especially for anything time-relative ("this year", "how long until...", "is X still...").',
    },
    scratchpad: {
      run: scratchpad,
      describe: 'scratchpad(action, key?, value?) — a working-memory notepad that survives across steps in a multi-step plan. action="set" (with key + value) saves a fact; action="get" (with key) reads one back, or omit key to dump everything; action="list" shows saved keys; action="clear" wipes it. Use this to record an intermediate finding (a number, a URL, a decision) in an early step so a later step doesn\'t have to re-derive or re-fetch it.',
    },
  };

  function describeAll() {
    return Object.values(REGISTRY).map(t => `- ${t.describe}`).join('\n');
  }

  /**
   * OpenAI/OpenRouter-format function-calling schemas for the same tools —
   * used on the native tool-calling path (see agent.js reactLoopNative).
   * Kept hand-written rather than derived from `describe` strings so the
   * JSON Schema types/required fields are exact, not guessed from prose.
   */
  const TOOL_SPECS = [
    { name: 'web_fetch', description: 'Fetch a real web page and return its readable text content. Use for anything current, or any URL the user gives you.',
      params: { url: { type: 'string', description: 'Full URL, must start with http:// or https://' } }, required: ['url'] },
    { name: 'web_search', description: 'Run a real live web search and return results (titles, snippets, links) as text. Use for current information or facts you are not certain of.',
      params: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
    { name: 'wikipedia', description: 'Look up an encyclopedic summary directly from Wikipedia. Prefer over web_search for definitions, history, biographies, background on well-established topics.',
      params: { query: { type: 'string', description: 'Topic to look up' } }, required: ['query'] },
    { name: 'weather', description: 'Get real current weather and a short forecast for a place.',
      params: { location: { type: 'string', description: 'City, region, or landmark name' } }, required: ['location'] },
    { name: 'calculator', description: 'Evaluate plain arithmetic exactly, no rounding mistakes.',
      params: { expression: { type: 'string', description: 'An arithmetic expression, e.g. "(12.5 * 3) / 2"' } }, required: ['expression'] },
    { name: 'json_query', description: 'Validate a JSON string and optionally extract a value at a path like "results[0].name".',
      params: { json: { type: 'string', description: 'The raw JSON text to validate/query' }, path: { type: 'string', description: 'Optional dot/bracket path to extract, e.g. results[0].name' } }, required: ['json'] },
    { name: 'js_exec', description: "Run JavaScript in an isolated sandbox and return console output plus the last expression's value.",
      params: { code: { type: 'string', description: 'JavaScript source to run' } }, required: ['code'] },
    { name: 'py_exec', description: 'Run Python (Pyodide/WASM, standard library only) in an isolated sandbox and return stdout plus the final expression value.',
      params: { code: { type: 'string', description: 'Python source to run' } }, required: ['code'] },
    { name: 'image_gen', description: 'Generate a real image from a text description and get back a usable URL to embed with markdown ![alt](url).',
      params: { prompt: { type: 'string', description: 'Description of the image to generate' } }, required: ['prompt'] },
    { name: 'cert_transparency', description: "Passive subdomain/hostname enumeration for a domain via crt.sh's public Certificate Transparency logs. No request ever touches the target. Good first recon step on an authorized target.",
      params: { domain: { type: 'string', description: 'Bare domain, e.g. "example.com" (no scheme/path)' } }, required: ['domain'] },
    { name: 'write_file', description: 'Write a full file into the current virtual PROJECT (e.g. "src/App.jsx"). Use instead of a plain code block whenever the task is a multi-file project rather than one explanatory snippet — gives the user a real downloadable file tree. Overwrites if the path exists.',
      params: { path: { type: 'string', description: 'File path within the project, e.g. "src/index.js" or "app/src/main/AndroidManifest.xml"' }, content: { type: 'string', description: 'Full file content' } }, required: ['path', 'content'] },
    { name: 'read_file', description: 'Read back a file already written to the project.',
      params: { path: { type: 'string', description: 'File path to read' } }, required: ['path'] },
    { name: 'list_files', description: 'List every file currently in the project workspace, with sizes.',
      params: {}, required: [] },
    { name: 'datetime', description: "Get the real current date and time. Always use instead of guessing today's date.",
      params: {}, required: [] },
    { name: 'scratchpad', description: 'A working-memory notepad that survives across steps in a multi-step plan.',
      params: {
        action: { type: 'string', enum: ['set', 'get', 'list', 'clear'], description: 'set (needs key+value), get (key optional), list, or clear' },
        key: { type: 'string', description: 'Entry name (for set/get)' },
        value: { type: 'string', description: 'Entry content (for set)' },
      }, required: ['action'] },
  ];

  function toolSpecs() {
    return TOOL_SPECS.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties: t.params, required: t.required },
      },
    }));
  }

  async function run(name, args) {
    const tool = REGISTRY[name];
    if (!tool) return { ok: false, error: `Unknown tool "${name}". Available tools: ${Object.keys(REGISTRY).join(', ')}` };
    try {
      return await tool.run(args || {});
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  return { run, describeAll, toolSpecs, names: () => Object.keys(REGISTRY) };
})();
