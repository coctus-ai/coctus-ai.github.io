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
