# Coctus AI

**Autonomous · Intelligent · Limitless**

A multi-model, agentic AI workspace that runs entirely as static files in the
browser — no backend, no server, no API keys to manage. Model access is
provided by [Puter.js](https://developer.puter.com/) (free, sign-in only) or,
optionally, your own OpenRouter key.

## Changelog (this pass)

- **Fixed: real desktop bug — sidebar toggle producing a blank screen.**
  Verified with actual Chromium screenshots (not simulation): `.main` had
  no explicit `grid-column`, so when the sidebar got `display:none`, CSS
  Grid's auto-placement reflowed `.main` into column 1 (the collapsed
  0-width track) instead of leaving it in column 2 — squeezing all content
  into a ~100px sliver with the real content area sitting empty. Fixed by
  pinning `grid-column` explicitly on both `.sidebar` and `.main`.
- **Fixed: `window.CoctusX` existence checks were always false.**
  `const CoctusKnowledge = (() => {...})()` at the top of a classic script
  creates a script-scope lexical binding, NOT a `window` property — so
  every `if (window.CoctusKnowledge)`-style guard across the app was
  silently always falsy. This had quietly disabled: knowledge-base
  auto-injection into chat, target-scope auto-injection into chat, the
  sidebar summary badges on startup, the `local_agent` tool (always
  reported "not configured"), and `add_finding` (always reported "not
  loaded") — all while the same features worked fine when triggered
  directly from a button click, which is why it went unnoticed. Fixed by
  switching every guard to `typeof CoctusX !== 'undefined'`.
- **New: Target/program workspace** (`js/targets.js`) — track scope
  (in/out), notes, and findings per bug bounty program or engagement,
  persisted in IndexedDB. Whichever target is set active gets its scope
  injected into every chat's system prompt as a safety rail, and the agent
  can log findings directly into it via the new `add_finding` tool instead
  of just describing them in prose.
- **New: scan file parser** (`js/scan-parser.js`) — paste or upload Nmap
  XML, Burp Suite XML, or Nuclei JSONL output; auto-detects the format,
  normalizes severities, and shows a checkable preview. Import selected
  items straight into the active target's findings, and/or save the full
  parsed set as a scan snapshot on the target (feeds the planned recon
  diffing feature). Unit-tested against real sample output from all three
  tools plus a garbage-input rejection case, and the full UI flow
  (paste → parse → deselect → import) was verified end-to-end in a real
  Chromium instance.
- **New: recon diffing** — each target now shows its full scan history;
  select any two snapshots and Compare shows exactly what's new, what
  disappeared, and how much is unchanged, matched by a stable per-item key
  (host+port for Nmap, name+host+path for Burp, template-id+match for
  Nuclei) rather than the display label, so a hostname re-resolving or
  wording change doesn't produce false diffs. Always diffs older→newer
  regardless of which snapshot you clicked first. Verified end-to-end with
  two real Nmap scans (one port closed, one new port opened) — correctly
  identified 1 new, 1 gone, 1 unchanged.
- **Enhanced: model-level auto-fallback + reasoning effort control.**
  Researched OpenRouter's live free-model catalogue directly against their
  API (not secondhand blog posts, which disagree with each other) — the
  free list genuinely rotates, and DeepSeek/Mistral/Gemini currently have
  zero free models despite older guides claiming otherwise. Two concrete
  gaps followed from that: (1) the app had key-level rotation for rate
  limits but no MODEL-level fallback — a model that's simply gone (404)
  hard-failed instead of switching; now it automatically retries against
  another live free model and surfaces a one-time toast, verified with a
  scripted 404 test. (2) `reasoning_effort` (low/medium/high, supported by
  many current models) was never sent at all; now exposed as a Settings
  control for the visible answer, and the internal verifier/second-opinion
  passes always request at least Medium regardless of that setting, since
  those are cheap, short, accuracy-critical calls where it's worth it
  unconditionally.
- **New: report builder** (`js/report-builder.js`) — export a target's
  scope, methodology (data sources used), notes, and findings (sorted by
  severity, with CVSS/description/PoC) as Markdown, Word, or PDF, reusing
  the app's existing export pipeline rather than a new one. This completes
  the four features from the original request: target workspace → scan
  parser → recon diffing → report builder, all feeding into and out of the
  same target data model. Verified with a realistic multi-severity sample
  including an XSS payload in the PoC field, to confirm severity ordering,
  accurate executive-summary counts, and — importantly — that the payload
  gets properly HTML-escaped in the docx-bound HTML rather than injected
  raw (a genuine risk category for this kind of report, since PoC fields
  routinely contain literal script tags).
- **Polish pass**: verified every panel added this session (Targets,
  Knowledge base, scan preview, diff results, report export, finding
  editor) at real mobile width (390px, Android Chrome UA) — zero
  horizontal overflow anywhere, confirmed by direct DOM measurement, not
  just eyeballing screenshots. Added auto-scroll so newly-opened panels
  (finding editor, scan preview, diff results) never sit off-screen
  requiring a manual scroll to notice. Added a visible busy state to the
  report export buttons (disabled + "Generating…") since docx/PDF
  generation is a synchronous block that deserves feedback, not a
  silently unresponsive button.
- **Enhanced: real coding capability, not just syntax checking.**
  `checkAndFixCode` previously only ran a syntax check — code with a real
  bug (wrong operator, undefined variable, off-by-one) that happened to
  parse cleanly sailed through untouched. It now actually EXECUTES
  self-contained JS/Python blocks via the existing sandboxed js_exec/
  py_exec workers to catch real runtime bugs, with a deliberately
  conservative safety heuristic (`isSandboxRunnable`) that skips execution
  for anything using `require`/`import`/`document.`/`window.`/`fetch(`/
  `fs.`/`process.`/etc — the sandbox has none of that, so running such
  code would "fail" for reasons that have nothing to do with correctness,
  and auto-"fixing" based on that would actively corrupt otherwise-correct
  code. Unit-tested against 12 cases including tricky ones (`open_file()`
  vs `open(`, `isWindowOpen()` vs `window.`) — a first draft of the regex
  had two real bugs in its word-boundary placement that these tests
  caught before shipping.
- **New: Code Review persona** — a distinct mode from Code (which writes
  new code) for reviewing existing/pasted code with a fixed structure:
  correctness → security → design, each issue quoting the exact line and
  the concrete failure mode, verified via execution where a bug is
  suspected rather than asserted. Explicitly told to say "no significant
  issues" when that's honestly the case, rather than manufacturing
  findings to seem thorough.
- **Code/Code Review personas now default to High reasoning effort**
  automatically (unless the user has explicitly picked a level themselves)
  — this is exactly where the extra effort measurably helps, and unlike
  general chat it's worth the latency cost by default.
- Tightened the base system prompt to skip throat-clearing openers.
- **Declined**: removing content filtering/safety behavior, including
  framed as red-teaming or research — not something this project will do,
  and mechanically it wouldn't work as pictured anyway since most of that
  behavior lives in the underlying model providers routed through
  OpenRouter/Puter, not in this app's own code.
- **New: Custom endpoint provider** — the real fix for "free models have a
  capability ceiling": a third provider option alongside Puter.js and
  OpenRouter that points Coctus at any OpenAI-compatible chat completions
  endpoint — a paid Anthropic/OpenAI key via a compatible proxy, a local
  llama.cpp/Ollama/LM Studio server, Groq, together.ai, etc. Settings →
  Custom endpoint: URL, optional API key, model name, with a test-connection
  button. Refactored the SSE streaming parser out of `chatOpenRouter` into
  a shared helper so both providers speak the identical protocol without
  duplicated code. Verified end-to-end with a mocked local server response
  — correct model name in the request body, config persisted, and (a real
  bug the test caught) the model dropdown wasn't refreshing after a
  successful test until Save was also clicked separately; fixed.
- **Enhanced: agentic trace UI**, inspired by reference screenshots of
  Claude's own agentic session UI. The underlying substance (plan,
  step-by-step progress, live tool calls, a project file browser with zip
  download) already existed — this pass added the visual polish those
  screenshots showed: a step-count badge (`2/3 steps`) and file/artifact
  count badge in the trace header, updated live as work progresses; a
  pulsing "active work" indicator on the phase dot instead of a static
  one; and `write_file` calls now show a friendly "📝 Editing file: path"
  while in progress and "📝 Wrote path" on completion, instead of a
  generic `write_file(path="...")` tool-call dump. Verified end-to-end by
  stubbing the agent pipeline to simulate a real multi-step, multi-file
  build and checking the actual rendered DOM — badges, row text, and
  project file count all came out exactly right.
- **Upgraded: the agentic checklist is now an actual checklist, not a
  progress log.** Steps previously just had a title and a vague activity
  description ("Research the topic") — running without error was treated
  as "done" regardless of whether anything was actually accomplished. Each
  step now gets a concrete, checkable completion criterion from the
  planner (e.g. "at least 2 independent sources confirm the affected
  version range"), the model is required to self-report a pass/fail
  against it in a parseable line, and the trace UI now visibly flags a
  step red when it ran but didn't actually meet its criterion — instead of
  a uniform green checkmark regardless of outcome. Verified end-to-end: a
  simulated failed step (PoC that still throws) correctly renders as
  "criteria-unmet" with the reason shown, not silently marked done.
- **New: Concise mode** (Settings) — essential-information-only responses:
  no preamble, no hedging, no closing "let me know if you'd like more
  detail." Shorter, not less complete — a genuine multi-file build or full
  report still gets everything it needs, just with the padding removed.
- **Content filtering removal: declined again**, same as before and for
  the same reasons — this doesn't change based on how the request is
  framed (research, red-teaming, or otherwise).
- **Corrected claim, verified against 7+ sources + OpenRouter's own docs**:
  there is no free model exempt from the daily request cap — it's a
  shared account-level bucket (50 or 1000/day) across every `:free` model,
  not a per-model exception. NVIDIA does have several genuinely $0-priced
  models right now, which the app already surfaces automatically via its
  live model-list fetch — nothing needed adding there.
- **New: local free-request budget tracker.** OpenRouter's own `/key`
  endpoint tracks dollar credit usage, which free-model calls don't move
  at all (they cost $0) — so it can't answer "how many of my 50 free
  requests are left today." Built the honest alternative: Coctus now
  tracks its own free-model request count locally (resetting at UTC
  midnight), and reads `is_free_tier` from `/key` once to know whether the
  cap is 50 or 1,000. Shown in Settings, clearly labeled as app-tracked
  rather than an authoritative OpenRouter-side count (since usage through
  the same key elsewhere wouldn't be visible here). Verified end-to-end:
  3 free-model calls counted, a paid-model call correctly excluded from
  the count, and the counter persists correctly across a reload.

- **Removed: service worker / PWA caching, for now.** Two rounds of real,
  confirmed bugs traced back to a phone/browser serving a stale mix of
  cached-old and freshly-deployed files after an update. `app.js` now
  actively unregisters any existing service worker and purges all caches on
  load, so every device self-heals to a clean, always-fresh state with no
  manual cache-clearing needed. `sw.js` is kept in the repo, dormant, with
  a header note on when/how to safely re-enable it once the app is stable.
- **Hardened `js/viewport.js`** — every feature (sidebar, height engine,
  keyboard-safe focus, error toast, SW-update listener) is now wrapped
  independently, so one failing API can't cascade and kill the rest of the
  file the way a single earlier issue did.
- **New: `local_agent` tool** — the client-side recon tools (DNS, cert
  transparency, IP geo, header scan) are inherently limited; a browser
  cannot do active scanning at all (no raw sockets). `local_agent` lets
  Coctus send a task to your own tool/agent server (Settings → Local
  agent) and return its response — the honest way to get real capability
  from a static, backend-less app.

- **Fixed: mobile sidebar showing as a broken full-screen overlay.**
  Root cause was a race — the sidebar's hidden/shown state depended on a JS
  class added deep inside an async `init()`, so a slow/failed init left it
  stuck open on top of everything. Mobile layout is now hidden-by-default in
  plain CSS with zero JS dependency; `js/viewport.js` (new) opens it only on
  explicit tap.
- **Fixed: PWA service worker serving stale/mismatched files after an
  update.** `sw.js` used cache-first for the HTML shell itself, so a phone
  that already had it installed kept serving an old `index.html` even after
  new files were deployed — a half-old/half-new mismatch that looked
  completely broken. Navigation requests are now network-first with a
  cache fallback for offline use, and updates auto-reload once instead of
  needing a manual hard refresh.
- **New: `js/viewport.js`** — a dependency-free responsive shell engine
  (loads first, before every other script): real viewport height, sidebar
  drawer, keyboard-safe composer, and a visible error toast on any uncaught
  script failure instead of a silently dead UI.
- **New: Knowledge base / RAG** (`js/knowledge.js`) — upload reference docs
  once (txt/md/pdf/docx/xlsx/csv/code), stored locally in IndexedDB, chunked
  and retrieved by TF-IDF relevance, auto-injected into every chat's system
  prompt. No embeddings API/key needed or available for a static app.
- **New: Mermaid diagram rendering** in the existing live-preview/artifact
  system — a ` ```mermaid ` code block now renders as a live diagram.
- **New: recon tools** — `dns_lookup` (Cloudflare DoH), `ip_geolocation`
  (ipapi.co), `security_headers` (via securityheaders.com), alongside the
  existing `cert_transparency`. All passive/OSINT — a browser can't do
  active scanning (raw sockets), so nothing here pretends to.
- **Improved: Team mode** now uses persona-specific role sets instead of one
  generic set — Security Research gets Recon → PoC/Exploit-Dev → Reviewer,
  Code gets Spec → Build → Review, everything else keeps
  Researcher → Writer → Critic.

## What changed in this rebuild

The **entire front end was rebuilt from scratch** in the style of Claude's
own web interface, while keeping **every feature** from the previous build:

- **One chat column, nothing docked to the side.** The old build had a
  permanent "workspace panel" (Agent trace / Project / Code / Preview tabs)
  next to the chat. That's gone. Now the plan, each step, tool calls, and
  any code/project the agent builds all stream **inline, under the message
  they belong to** — expand/collapse it like Claude's own tool-use and
  thinking blocks. Nothing to open, nothing to lose track of.
- **Live artifacts render in place.** Clicking "▶ Preview" or "Open" on a
  code block expands a card directly under that block — live sandboxed
  iframe preview, syntax-highlighted code view, or a live-editable canvas —
  right there in the conversation, not in a separate window.
- **Project workspace, inline too.** When the agent uses `write_file` to
  build a multi-file project, a file tree appears inside that message's
  trace card, live, with per-file preview and a "Download project (.zip)"
  button.
- **Settings moved out of a permanent sidebar into a Settings dialog**
  (gear icon, or click the model name in the top bar) — provider, model,
  hybrid execution, agent mode/persona, all mode toggles, deep research /
  team mode, second-opinion model, and your profile. The sidebar itself is
  now just your chat history, like Claude's.
- **Quick-toggle chips in the composer** (Tools / Search / Thinking / Deep
  Research / Team) mirror Claude's own extended-thinking-style toggle, so
  you don't need to open Settings for the modes you flip often.
- **New visual identity**: Coctus AI's own mark (the geometric "L" + circuit
  brain) is used as the favicon, PWA icon (all sizes, incl. maskable), and
  the empty-state/sidebar brand mark. Color system rebuilt around the
  logo's violet/purple, in both light and dark themes.

**Nothing underneath was rewritten or removed.** `models.js`, `memory.js`,
`tools.js`, `files.js`, `documents.js`, `agent.js`, `validate.js`, and
`workspace.js` are the same engine as before, completely UI-agnostic — they
only ever talk to the interface through plain callbacks (`onToken`,
`onPlan`, `onStepStart`, `onToolCall`, etc.), so every backend feature
(agentic planning loop, real tools, personas, deep research, team mode,
hybrid execution, memory/recall, exports, project workspace, provider
rotation, syntax verification…) works exactly as it did — just presented
inline instead of in a side panel.

## Features (all present, all inline in chat)

- **Agentic planning loop** — plan → step-by-step execution (with real
  tools) → self-verification → revision, all visible as a live, collapsible
  trace card under the reply as it's written.
- **Real tools** — `web_search`, `web_fetch`, `wikipedia`, `weather`,
  `calculator`, `json_query`, `image_gen`, `js_exec`/`py_exec` (sandboxed
  Web Workers), `cert_transparency`/`dns_lookup`/`ip_geolocation`/
  `security_headers` (passive recon), `datetime`,
  `scratchpad`, and `write_file`/`read_file`/`list_files` for the project
  workspace.
- **Knowledge base / RAG** — upload reference documents once (sidebar →
  Knowledge base); every chat after that automatically pulls in the most
  relevant passages via local TF-IDF retrieval. Stored in IndexedDB, never
  uploaded anywhere.
- **Live preview / artifacts** — HTML, SVG, CSS, JS/TS, React (JSX/TSX), and
  Mermaid diagram code blocks get an inline "▶ Preview" card, sandboxed
  iframe, no same-origin access. Multi-block replies get "Preview as one
  app" and "Download all as .zip".
- **Live-editable canvas** — "✎ Edit" on any code artifact, re-run the
  preview against your edit, or hand it back to Coctus to continue from.
- **Project workspace** — multi-file projects the agent builds via
  `write_file`, browsable inline, downloadable as one real `.zip`.
- **Agent modes / personas** — General, Research, Code, Security Research,
  Creative.
- **Deep Research** and **Team mode** (Researcher → Writer → Critic),
  mutually exclusive.
- **Hybrid execution** — plan/review on one model, execute with another
  (same provider).
- **Cross-model second opinion** — an independent reviewer model checks the
  draft before you see it.
- **Visible reasoning ("Show thinking")** — a collapsible "Thought process"
  block above the answer.
- **Semantic-ish memory recall**, auto-summarized long conversations,
  pinned/editable facts, a structured profile, backup/restore.
- **Edit any past message and resubmit** — pencil icon under your message; saving drops that reply (and anything after it) and generates a fresh one, same as Claude/ChatGPT.
- **Regenerate any reply** — 🔄 button on any assistant message re-asks the same turn, discarding that reply and anything after it.
- **Floating "scroll to latest"** button appears once you've scrolled away from the newest message.
- **Multiple sessions** — search, star, rename (via first message), delete.
- **Multi-format file attachment** (images, PDF, DOCX, XLSX, ZIP, code/text,
  15MB cap) and **multi-format export** (Markdown, PDF, TXT, JSON, DOCX,
  XLSX, PPTX).
- **Voice input** (Web Speech API) and **Listen** (TTS via Puter), both
  feature-detected.
- **Command palette** (`⌘K`/`Ctrl+K`), light/dark theme, installable PWA,
  offline app-shell caching, toast notifications, full keyboard/focus
  handling on all dialogs.
- **A real mobile viewport engine** — `.app`'s height is driven live by the VisualViewport API (with `dvh`/`vh` CSS fallbacks), so the layout stays correct and the composer never hides behind the on-screen keyboard, even on browsers with partial/no support for modern viewport units. All text inputs are pinned to 16px on mobile to stop iOS Safari's forced zoom-on-focus.
- **OpenRouter provider** with multi-key rotation, alongside Puter.js.

## Project layout

```
coctus-ai/
├── index.html
├── manifest.json
├── sw.js
├── key.js                 # optional OpenRouter keys — see the security note inside
├── css/style.css
├── icons/                 # generated from the Coctus AI mark, all PWA sizes
└── js/
    ├── app.js              # UI wiring (rebuilt) — chat flow, inline trace/artifacts, settings
    ├── viewport.js          # responsive shell engine — loads first, sidebar/keyboard/error-toast
    ├── knowledge.js         # local knowledge base / RAG — IndexedDB + TF-IDF retrieval
    ├── agent.js             # plan → execute (tools) → verify loop — unchanged engine
    ├── models.js             # Puter.js + OpenRouter gateway — unchanged engine
    ├── memory.js              # sessions, facts, recall, auto-summarization — unchanged engine
    ├── tools.js                # real tools (search/fetch/exec/recon/etc.)
    ├── files.js                 # multi-format upload processing — unchanged engine
    ├── documents.js              # Markdown/PDF/DOCX/XLSX/PPTX export — unchanged engine
    ├── validate.js                # client-side code syntax checks — unchanged engine
    └── workspace.js                # in-memory multi-file project — unchanged engine
```

## Local preview

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deploy to GitHub Pages

1. Push this folder's contents to a repo (the `coctus-ai/` folder becomes
   the repo root).
2. **Settings → Pages** → Source: **Deploy from a branch**, branch `main`,
   folder `/ (root)`. Save.
3. Your app is live at `https://your-username.github.io/your-repo-name/`
   within a minute or two.
4. Puter.js needs no key. For OpenRouter, open the app → the gear icon
   (Settings) → Provider → OpenRouter, and paste your key into the field
   there — it saves to your browser's own `localStorage`, never into the
   deployed page's files. Don't put real keys into `key.js` for a public
   deployment; see the note inside that file.

Every visitor's chats, memory, and any key they enter live only in their own
browser's `localStorage` — nothing is shared between visitors, nothing
routes through a server you run.

## Customizing

- Change the assistant's persona/instructions in `PERSONAS` inside
  `js/app.js`.
- Adjust the curated fallback model list in `js/models.js`.
- Swap the color tokens at the top of `css/style.css` (`:root` /
  `html[data-theme="dark"]`) to re-theme.
- Replace `icons/*` (and re-run a resize pass) to swap the brand mark.
