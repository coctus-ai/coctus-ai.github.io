/**
 * validate.js — best-effort syntax checking for code blocks the model
 * produces. Runs entirely client-side and never EXECUTES untrusted code —
 * only parses it. Where a real parser is available it's used (much fewer
 * false positives/negatives than a heuristic); otherwise falls back to a
 * structural check and is honest about that via `unverified: true`.
 *
 *  - JSON            → JSON.parse (exact)
 *  - JS / JSX / TS / TSX → Babel standalone AST parse (exact; handles
 *    imports, JSX, and TypeScript type syntax, unlike a plain Function()
 *    eval which silently skips all of those)
 *  - HTML            → DOMParser + tag-balance check (catches unclosed/
 *    mismatched tags DOMParser's error-correction would otherwise hide)
 *  - CSS             → brace/paren balance + malformed-selector /
 *    missing-colon heuristics
 *  - Python          → bracket/quote balance + indentation-consistency +
 *    "colon must start a block" heuristics (no in-browser CPython parser
 *    is loaded just for validation — py_exec's Pyodide is much heavier)
 *  - anything else   → bracket/paren/brace balance only
 */

const CoctusValidate = (() => {

  function checkJson(code) {
    try { JSON.parse(code); return { ok: true }; }
    catch (e) { return { ok: false, message: e.message }; }
  }

  // ---------------- JS / JSX / TS / TSX (real parse via Babel) ----------------
  function checkJsLike(code, lang) {
    if (!(window.Babel && Babel.transform)) return checkBrackets(code); // Babel not loaded yet — degrade gracefully
    const isTs = /^tsx?$/.test(lang) || lang === 'typescript';
    const isJsx = /^(jsx|tsx)$/.test(lang) || /<\/?[A-Za-z][\w.]*[^>]*>/.test(code);
    const presets = [];
    if (isTs) presets.push('typescript');
    if (isJsx) presets.push('react');
    try {
      Babel.transform(code, {
        presets,
        filename: isTs ? (isJsx ? 'f.tsx' : 'f.ts') : (isJsx ? 'f.jsx' : 'f.js'),
        sourceType: 'module',
        babelrc: false, configFile: false,
      });
      return { ok: true };
    } catch (e) {
      // Babel's message is already concise ("Unexpected token, expected ...
      // (12:4)") — strip the internal codeFrame it appends after a blank line.
      const message = String(e.message || e).split('\n')[0];
      return { ok: false, message };
    }
  }

  // ---------------- HTML ----------------
  const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

  function checkHtml(code) {
    let parseError = null;
    try {
      const doc = new DOMParser().parseFromString(code, 'text/html');
      const err = doc.querySelector('parsererror');
      if (err) parseError = err.textContent.split('\n')[0];
    } catch (e) { parseError = e.message; }

    // DOMParser silently self-heals most mismatched/unclosed tags rather
    // than erroring, so it catches only the worst cases — pair it with an
    // explicit open/close tag count per tag name to catch the rest.
    const opens = {}, closes = {};
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
    let m;
    while ((m = tagRe.exec(code))) {
      const name = m[1].toLowerCase();
      if (VOID_TAGS.has(name) || m[2] === '/' || /<!--/.test(m[0])) continue;
      if (m[0].startsWith('</')) closes[name] = (closes[name] || 0) + 1;
      else opens[name] = (opens[name] || 0) + 1;
    }
    for (const name of new Set([...Object.keys(opens), ...Object.keys(closes)])) {
      const o = opens[name] || 0, c = closes[name] || 0;
      if (o !== c) return { ok: false, message: `<${name}> opened ${o} time(s) but closed ${c} time(s)` };
    }
    if (parseError) return { ok: false, message: parseError };
    return { ok: true };
  }

  // ---------------- CSS ----------------
  function checkCss(code) {
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, ''); // ignore comments for balance purposes
    const brackets = checkBrackets(stripped);
    if (!brackets.ok) return brackets;
    // A declaration line inside a rule block missing its colon (e.g.
    // "color red;" instead of "color: red;") is a common model slip that
    // brace-balance alone won't catch.
    let depth = 0;
    const lines = stripped.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (depth > 0 && line && !line.endsWith('{') && !line.endsWith('}') && line.endsWith(';')
          && !line.includes(':') && !line.startsWith('//') && !line.startsWith('@')) {
        return { ok: false, message: `Declaration missing a colon: "${line}"` };
      }
    }
    return { ok: true, unverified: true };
  }

  // ---------------- Python (heuristic — no in-browser parser loaded for this) ----------------
  function checkPython(code) {
    const brackets = checkBrackets(code);
    if (!brackets.ok) return brackets;
    const lines = code.replace(/\r\n/g, '\n').split('\n');
    let sawTabs = false, sawSpaces = false;
    let expectIndentNext = false;
    let prevIndent = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const indentMatch = raw.match(/^[ \t]*/)[0];
      if (indentMatch.includes('\t')) sawTabs = true;
      if (indentMatch.includes(' ')) sawSpaces = true;
      if (sawTabs && sawSpaces) return { ok: false, message: `Mixed tabs and spaces in indentation near line ${i + 1}` };
      const indent = indentMatch.length;
      const code_ = raw.trim();
      if (expectIndentNext && indent <= prevIndent && code_ && !/^(elif|else|except|finally)\b/.test(code_)) {
        return { ok: false, message: `Expected an indented block after line ${i} (line ending in ":")` };
      }
      expectIndentNext = /:\s*(#.*)?$/.test(code_) && !code_.startsWith('#');
      prevIndent = indent;
    }
    return { ok: true, unverified: true };
  }

  function checkBrackets(code) {
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const closers = { ')': '(', ']': '[', '}': '{' };
    const stack = [];
    let inString = null;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      const prev = code[i - 1];
      if (inString) {
        if (c === inString && prev !== '\\') inString = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
      if (pairs[c]) stack.push(c);
      else if (closers[c]) {
        if (stack.pop() !== closers[c]) return { ok: false, message: `Unbalanced "${c}"` };
      }
    }
    if (stack.length) return { ok: false, message: `Unclosed "${stack[stack.length - 1]}"` };
    return { ok: true, unverified: true };
  }

  /** Returns { ok, unverified?, message? } */
  function check(code, lang) {
    const l = (lang || '').toLowerCase();
    if (!code || !code.trim()) return { ok: true };
    if (l === 'json') return checkJson(code);
    if (['js', 'javascript', 'mjs', 'cjs', 'jsx', 'ts', 'typescript', 'tsx'].includes(l)) return checkJsLike(code, l);
    if (l === 'html' || l === 'htm' || l === 'xml') return checkHtml(code);
    if (l === 'css' || l === 'scss' || l === 'less') return checkCss(code);
    if (l === 'py' || l === 'python') return checkPython(code);
    return checkBrackets(code);
  }

  return { check };
})();
