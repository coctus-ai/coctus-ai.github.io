# Coctus AI

**Autonomous · Intelligent · Limitless**

A multi-model, agentic AI workspace that runs entirely as static files in the
browser — no backend, no server, no API keys to manage. Model access is
provided by [Puter.js](https://developer.puter.com/) (free, sign-in only) or,
optionally, your own OpenRouter key.

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
  Web Workers), `cert_transparency` (passive recon), `datetime`,
  `scratchpad`, and `write_file`/`read_file`/`list_files` for the project
  workspace.
- **Live preview / artifacts** — HTML, SVG, CSS, JS/TS, and React (JSX/TSX)
  code blocks get an inline "▶ Preview" card, sandboxed iframe, no
  same-origin access. Multi-block replies get "Preview as one app" and
  "Download all as .zip".
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
- **Multiple sessions** — search, star, rename (via first message), delete.
- **Multi-format file attachment** (images, PDF, DOCX, XLSX, ZIP, code/text,
  15MB cap) and **multi-format export** (Markdown, PDF, TXT, JSON, DOCX,
  XLSX, PPTX).
- **Voice input** (Web Speech API) and **Listen** (TTS via Puter), both
  feature-detected.
- **Command palette** (`⌘K`/`Ctrl+K`), light/dark theme, installable PWA,
  offline app-shell caching, toast notifications, full keyboard/focus
  handling on all dialogs.
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
    ├── agent.js             # plan → execute (tools) → verify loop — unchanged engine
    ├── models.js             # Puter.js + OpenRouter gateway — unchanged engine
    ├── memory.js              # sessions, facts, recall, auto-summarization — unchanged engine
    ├── tools.js                # real tools (search/fetch/exec/etc.) — unchanged engine
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
