# Coctus AI

## v11 — workspace panel state leak fixed, code blocks can join the project (latest)

**Fixed a real bug from v10** (and, it turns out, predating it): switching sessions or starting a New Chat only ever reset the Agent Trace tab. The Code tab's snippet history, an open live preview, and — new in v10 — an open project file view could all silently carry over from a completely different conversation. Replaced the scattered per-tab clearing with one `resetWorkspacePanel()` that fully resets Code/Preview/Project state and switches back to the trace tab, called consistently from both New Chat and session switching.

**New: bridge chat code blocks into the Project workspace.** Every code block in a reply now has a "+ Project" button alongside Open/Preview/Download/Copy — adds that snippet to the project workspace under a filename you pick (with a best-effort suggestion, including picking up on a `// file: path` or `# filename: path` hint left in the code itself). Useful when the agent wrote something useful as a plain snippet rather than via `write_file`, or when you want to manually assemble a project from parts of a conversation.

## v10 — Project Workspace: real multi-file projects, not just code blocks

The next-gen feature this round: a virtual, in-memory **project workspace** the agent can build up across a run via three new tools — `write_file`, `read_file`, `list_files` — instead of only ever producing isolated code blocks inside a reply.

- New **Project** tab in the workspace panel (alongside Agent trace / Code / Preview): a real file tree, updated live as the agent writes files mid-run, each file viewable with syntax highlighting, copyable, and downloadable individually.
- **Download the whole project as one `.zip`** — via JSZip, already loaded for document export, so no new dependency. One click, real file paths preserved (`src/App.jsx`, `app/src/main/AndroidManifest.xml`, whatever the agent wrote).
- The Code and Security Research personas now know to reach for this whenever a task is genuinely multi-file (a small app, an Android scaffold, a PoC + report + notes) rather than stacking several code blocks in one reply.
- Scoped honestly: this is in-memory for the current tab session, like the existing scratchpad tool — not persisted to localStorage (project files can be large, and silently persisting arbitrary generated code across reloads/quota limits isn't worth the complexity for a feature whose main value is "download it when it's ready"). Cleared on New Chat or switching sessions — download the zip first if you want to keep it.

Try it: ask for something like *"scaffold a small Android app with a single activity"* or *"build a small multi-file web app"* and watch the Project tab fill in live.

## v9 — memory leak, missing size limits, offline handling, link previews

Another audit pass, same spirit as v8 — real gaps found and fixed, not new features for their own sake:

- **Fixed a real memory leak**: every `js_exec`/`py_exec` call created a `Worker` from a blob URL and never revoked it — over a long session running lots of code, that's a permanently growing list of leaked blob URLs for the tab's lifetime. Now revoked immediately after the worker picks up the script.
- **Fixed a real gap**: there was no file size limit on attachments at all — someone could attach a huge video or archive, which would get read into memory, embedded in the message, and likely blow past both the model's context window and (via session save) localStorage's quota in one shot. Now capped at 15MB per file with a clear toast explaining why a file was skipped.
- **Offline handling, previously nonexistent**: sending a message while offline used to just fail with whatever raw network error came back. Now: an immediate, clear message if you're already offline when you hit send, plus a toast when the connection actually drops or comes back mid-session.
- **Link previews**: added Open Graph/Twitter card meta tags, so sharing a link to a deployed copy actually shows a title, description, and icon instead of nothing.

## v8 — accessibility, error handling, and storage resilience hardening

A cross-cutting pass, not one feature — audited and fixed real gaps across several areas at once:

**Accessibility:**
- Every modal (Memory, Export, Command Palette) now has proper `role="dialog"`/`aria-modal`/labelling, moves focus into itself on open, and returns focus to whatever triggered it on close — previously focus just vanished for keyboard/screen-reader users.
- **Escape now actually closes whichever modal is open** — before, only the command palette had this; Memory and Export had no keyboard way to close at all.
- Icon-only buttons that were missing `aria-label` (Memory/Export close buttons) now have one.
- Touch targets on mobile bumped to 44px (icon buttons) / 40px (send, attach, persona chips) — several were sitting at 28-34px, below the standard accessibility guideline for touch.

**Error handling — fixed a real, misleading bug:**
- The generic "something went wrong" message always said *"check that you're signed in with Puter"* — even when you were on OpenRouter, even when it was a plain rate limit. Replaced with `buildErrorMessage()`, which gives accurate, actionable guidance per actual failure (rate limit specifics with the real free-tier numbers, missing/invalid OpenRouter key with a direct pointer to the sidebar field, or the original Puter guidance only when Puter is actually the active provider).
- All three "Copy" actions (message actions, code-block toolbar, code viewer panel) now handle clipboard failures instead of failing silently — clipboard access can be blocked (insecure context, permissions, some mobile browsers) and previously gave zero feedback either way.

**Storage resilience — fixed a real silent-failure bug:**
- If localStorage filled up, saves were failing with nothing but a `console.warn` — invisible to anyone not in DevTools, meaning a session could just silently stop persisting. Now: if saving sessions hits quota, it automatically prunes the oldest unstarred sessions and retries once, and either way — recovered or not — tells you about it via a toast instead of failing silently. Star anything you don't want auto-pruned.
- New lightweight toast notification system (`showToast()`) backing all of the above, reusable for anything else that needs a brief, non-blocking notice.

## v7 — Ollama removed, hybrid execution is now cloud-only

Ollama (the local/offline provider added in v5, used for hybrid execution in v6) has been fully removed — it required a separate program running on your own machine, reachable only from that same machine, which added real setup friction and confusion for a project meant to just work from a browser.

- **Provider list is back to two**: Puter.js and OpenRouter. Nothing local, nothing offline, nothing that only works from one specific device.
- **"Hybrid execution" now means two cloud models, not two providers**: the toggle still splits discussion/planning/review from actual writing/tool-execution, but both now run on the model you pick from the SAME provider (OpenRouter) — e.g. plan with a stronger reasoning model, execute with a faster/cheaper one. All the `agent.js` plumbing from v6 (independent `execModel` threaded through step execution, final synthesis, revisions, Team mode's Writer) is unchanged; only where the "second model" comes from changed.
- Removed: the Ollama provider chip, its setup hint, `chatOllama`/`listModelsOllama` and related code in `models.js`, and all Ollama-specific branching in `app.js`.
- GitHub Pages deployment is unaffected — Puter.js still needs zero setup, OpenRouter still uses the in-browser key field from v6.

## Deploying to GitHub Pages

This is a static site — no build step, no backend — so GitHub Pages is a direct fit:

1. Create a new GitHub repo and push this folder's contents to it (the whole `coctus-ai/` folder becomes the repo root).
2. Repo → **Settings → Pages** → under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
3. GitHub gives you a URL like `https://your-username.github.io/your-repo-name/` within a minute or two.
4. Open it, go to the sidebar's Provider section, pick **OpenRouter**, and paste your key into the **key field in the app itself** — not into `key.js`. That field saves to your browser's own localStorage only; it's never part of the deployed page's files. This matters because anything actually written into `key.js` and pushed to the repo is plain-text-readable by anyone who opens the page (view-source, DevTools) — there's no way around that for a backend-less app, so don't put real keys in files that get committed to a public repo. `key.js` ships as a safe empty template for exactly this reason — leave it that way for a public deployment.
5. Puter.js needs no key at all and works immediately.

That's the whole deployment. Every visitor's chats, memory, and any key they enter live only in their own browser's localStorage — nothing is shared between visitors, and nothing routes through a server you run.

## v6 — hybrid agentic loop (discuss/plan/review on cloud, execute locally), GitHub Pages ready

*(Superseded by v7 above — hybrid execution now uses two cloud models instead of a local one, since the Ollama piece described below was removed.)*

**Hybrid execution — the actual "advanced agentic loop" ask:**
- New "Hybrid execution" toggle in the sidebar. When on, **discussion, planning, and review stay on your primary model** (OpenRouter, typically) while **the actual writing and tool-execution work routes to a separate local Ollama model** — unlimited, private, no rate limit, genuinely offline once pulled. This is a real architectural split, not a relabeling: `agent.js` now threads an independent `execModel`/`execProvider` through every content-writing call (step execution, final answer synthesis, revision-after-review, the Team mode Writer) while every reasoning-about-the-answer call (the planner, the verifier, the completion-checker, the critic) stays on the primary model. Fully backward compatible — leave the toggle off and behavior is identical to before.
- `planFor` now also returns a short **discussion** note — "here's what I understood and how I'll approach it" — shown immediately, at no extra API-call cost (folded into the existing planning call rather than a separate round-trip).
- New `onPhase` callback surfaces which phase is running and on which model right now (Discussing / Planning / Executing (local: …) / Reviewing) in the topbar status line — full visibility into what stage a big multi-step run is in.

**Two more real bugs fixed:**
- `setProvider()` was still hard-rejecting `'ollama'` from last round's addition — the Ollama provider chip was silently a no-op until now.
- (carried from v5) native tool-call content leak — still fixed, unaffected by this round.

**GitHub Pages ready:**
- Added `.nojekyll` (so GitHub doesn't run this through Jekyll and skip anything).
- Added an **in-browser OpenRouter key field** (Provider → OpenRouter → the key box) backed by localStorage — the safe way to use OpenRouter on a public deployment, since nothing typed there ever becomes part of the repo or the page's own source, unlike anything hardcoded into `key.js`.
- All paths (manifest, service worker, icons) were already relative, so the app works correctly whether it's served at a domain root or a GitHub Pages subpath like `/repo-name/` — no changes needed there.
- Service worker cache version bumped so a Pages visitor's browser actually picks up this version instead of serving a stale cached shell from before.

## v5 — rebrand, local/offline models, security-research focus, real bug fixes

**Renamed:** Locxy AI → **Coctus AI** — title, manifest, app icons (regenerated), all user-facing strings.

**Mobile:** the PWA install setup (manifest.json + service worker + icons) was already in place from before; icons regenerated to match the new brand, cache version bumped so existing installs actually pick up all of this rather than serving a stale shell.

**Two real bugs fixed:**
- The light/dark theme toggle was inverted after the v3 redesign switched the CSS default from dark to light — `toggleTheme()` still assumed dark was the default, so switching to "dark" from the UI silently did nothing. Fixed to match the new CSS convention.
- Native OpenRouter tool-calling could leak a model's short preamble text (e.g. "Let me check that...") onto the screen before it was known a tool call was coming right behind it, since content deltas were forwarded as soon as they arrived. Now buffered until either a tool_call delta actually appears (suppressed for good) or enough content arrives with none seen (revealed as a real answer) — same idea as the text-protocol reveal-buffering, but driven by the real structured signal instead of a guess.

**Local, offline, genuinely free models — via Ollama:** a third provider option alongside Puter.js and OpenRouter. Points straight at your own `ollama serve` on `localhost:11434` — nothing added to this project's own code is a "backend"; Ollama's own local server is the backend, running on your machine, same relationship this app already has with OpenRouter's cloud API. Native tool-calling works here too for models that support it (qwen2.5-coder, llama3.1, mistral-nemo, etc.), with the same automatic fallback-and-remember behavior as OpenRouter. Requires `OLLAMA_ORIGINS` to allow this page's origin — see the hint that appears when you select it.

**Security research pivot:**
- New "Security Research" persona: recon/enumeration methodology, reproducible-findings framing, tools used eagerly to verify rather than assert.
- New `cert_transparency` tool: passive subdomain/hostname enumeration for a domain via crt.sh's public Certificate Transparency logs — never touches the target itself, the standard first step of authorized recon.
- **Not implemented, on purpose:** removing content filtering / training the agent to never refuse. That's disabling the model's own safety behavior, not a Coctus-specific feature, and it's not something I'll build regardless of the stated use case. If you want a model with no built-in refusals, that's a property of whichever model you choose to run — the new Ollama option means you can point this app at any locally-hosted model you like, and how that model behaves is between you and it, not something this app's code forces.

## v4 — real-time streaming, native tool calling, deeper validation

**Streaming, fixed for real:**
- Tool-enabled replies previously didn't stream at all — the whole answer appeared at once only after the full turn finished, because the ReAct loop never passed `onToken` through. Now it does, using a reveal-buffering trick on the text protocol (hold back visible output only until we're sure it's not a `TOOL_CALL:` line, then flush and stream live) — or, on OpenRouter, real native streaming with no buffering needed at all (see below).
- Each plan step's working notes now stream live into the trace panel as they're written (`onStepToken`), not just once the step finishes — you see Locxy actually thinking through big/multi-file projects step by step, not a blank panel until it's done.

**Native OpenRouter tool calling:**
- On OpenRouter, tool use now goes through the real OpenAI-compatible `tools`/`tool_calls` API instead of the text-based `TOOL_CALL: {...}` protocol — the model's tool call and its real answer are structurally separate fields, so there's no ambiguity to parse around at all. Falls back automatically (and remembers, for the session) to the text protocol for any model/provider that doesn't support it.

**"Endless" responses for big projects:**
- The run-to-completion loop (auto-continues an answer that got cut off) is no longer capped at 4 rounds sharing a budget with quality checks — it now gets its own dedicated cap of 20 rounds (25 for Deep Research), so a large multi-file project keeps writing across as many continuations as it actually needs.

**Validation, made real:**
- JS/JSX/TS/TSX now get an actual AST parse via Babel standalone instead of a `Function()`-eval trick that silently skipped anything using `import`/`export`/JSX/TypeScript syntax (i.e. skipped most real code).
- HTML gets DOMParser + explicit open/close tag-count checking (DOMParser alone silently self-heals most broken markup).
- CSS gets brace-balance plus a missing-colon-in-declaration check.
- Python gets bracket-balance plus indentation-consistency and "colon must start an indented block" checks.
- The auto-fix pass now re-validates its own fix and retries once with the new error if the first fix is still broken, instead of trusting a single blind pass.

## v3 — reliability + redesign

**Agentic loop, fixed:**
- Tool-call detection was fully anchored (`^TOOL_CALL:\s*{...}$`) — one word of prose before/after the JSON and it silently failed. Now scans for the `TOOL_CALL:` marker anywhere in the response and brace-matches the JSON object, tolerating lead-ins/trailing notes from any model.
- Internal helper calls (planner, gap-checker, verifier, critic, completion-checker) previously had no retry — one transient hiccup silently degraded quality. They now get one retry with backoff before falling back.
- Added a per-turn **internal call budget** (6 calls) shared across gap-checks/verifier/critic/completion-rounds, so one message can no longer cascade into a dozen+ requests and blow through free-tier rate limits (20/min, 50/day on OpenRouter free models) mid-answer.
- New tools: `datetime` (real current date/time — models were silently guessing), `scratchpad` (working-memory notepad that survives across a multi-step plan's steps).

**Interface, redesigned:**
- Full visual rebuild: minimal, warm-neutral, single-accent design (Claude/ChatGPT-inspired) replacing the previous dark dev-dashboard look — same DOM/IDs, so every existing feature (sessions, memory, exports, trace panel, code viewer, live preview) works unchanged.
- Assistant replies now render as plain text (no card/box); your own messages appear as a quiet rounded bubble — the one place a "bubble" is used at all.
- Cleaner sidebar, composer, modals — quieter borders, more whitespace, one accent color used consistently for every actionable/active state.

---


A multi-model, agentic AI workspace that runs entirely as static files in the
browser — no backend, no server, no API keys to manage. Model access is
provided by [Puter.js](https://developer.puter.com/), which lets front-end
code call Claude, GPT, Gemini, Grok, DeepSeek, and 500+ other hosted models
directly; each visitor authenticates with their own free Puter account and
uses their own quota, so you never pay for or provision anything server-side.

## Features

- **Live preview / artifacts panel** — HTML, SVG, CSS, JS/TS, and React (JSX/TSX) code blocks get a "▶ Preview" button that renders the code live in an isolated sandboxed iframe — a runnable artifact, similar in spirit to Claude's canvas. React snippets are compiled on the fly with Babel standalone; plain JS/TS gets a visible console-output panel since there's no page to print to. "Open in new tab" pops the artifact out as its own page. When a reply has separate HTML + CSS + JS blocks meant to be one app, a "▶ Preview as one app" button combines them into a single document instead of previewing each in isolation.
- **Light/dark theme** — every color in the app is a CSS variable, so the sidebar toggle re-themes the whole UI instantly, remembers your choice, and swaps the code-highlighting palette to match.
- **Universal web search tool** — `web_search` is now a real tool any model can call (not just OpenAI-family models, which is the only family Puter wires a native search tool up for), going through the same CORS-friendly reader proxy as `web_fetch`.
- **Memory pinning & editing** — saved facts can be pinned (📌) so they're always included in context regardless of relevance scoring, or edited in place by clicking them, not just deleted.
- **Model picker** — live list of every model Puter currently exposes, grouped by provider.
- **Real tools, not just text** — with the "Tools" toggle on, Locxy can actually call `web_fetch` (reads a live URL via the Jina AI Reader proxy), `calculator` (exact arithmetic), `js_exec`, and `py_exec` (real JavaScript / Python — the latter via Pyodide/WASM — each running in an isolated, timeout-capped Web Worker, no DOM/localStorage access). It decides on its own when a tool would help, using a ReAct-style call-and-respond loop, visible live in the Agent trace panel.
- **Agentic planning loop** — for non-trivial requests, Locxy drafts a short plan, works through each step (with tool access) in the side "Agent trace" panel, checks itself once for a genuine remaining gap and runs up to 2 extra ad-hoc steps to close it, then synthesizes a final answer. Toggle it off for fast, direct single-pass answers.
- **Self-verification pass** — before showing you the final answer, a separate internal pass checks it against the request and any tool output actually gathered, and triggers one revision round if it finds a concrete, fixable problem (not style nitpicking).
- **Semantic-ish memory recall** — saved facts and messages from *other* past sessions are ranked by term-vector similarity to what you're currently asking, so relevant history surfaces automatically instead of only ever using the most recent thing.
- **Auto-summarized long conversations** — once a session gets long, older turns are folded into a running summary (kept updated as you go) instead of sending the entire raw transcript to the model every turn.
- **Run to completion** — after answering, Locxy checks whether it actually finished a multi-part task (all files written, nothing left as "add later") and automatically continues if not, up to a safety cap, instead of stopping partway.
- **Client-side syntax verification** — code blocks in the final answer get a lightweight structural check (JSON parsing, JS parsing, bracket balance); anything that fails is sent back for a targeted fix before the message is finalized.
- **Code viewer panel** — click "Open" on any code block to view it full-size, syntax highlighted, in a dedicated side panel with copy/download — similar in spirit to Claude's artifact panel. Supports multiple open snippets as tabs.
- **Multi-file upload, any type** — attach several files at once: images go straight to vision-capable models, PDFs/DOCX/XLSX/ZIP are parsed for text client-side, code/text files are read directly, and anything else is still attached by name/type/size so the model knows it exists.
- **Downloadable output everywhere** — every code block gets its own Download button; any assistant reply can be exported as Markdown, PDF, or Word (.docx) directly from the message; and a reply with multiple code blocks gets a "Download all as .zip" button that bundles them into one file.
- **Real mobile layout** — sidebar and workspace panel are proper off-canvas drawers with a backdrop on phones/tablets, not a squeezed desktop grid; uses `dvh` units and contained scroll regions so the page can't overflow or double-render.
- **Persistent local memory** — sessions and a small set of remembered facts about you are stored in `localStorage` on your device only. Nothing is uploaded anywhere except the messages you send to your chosen model.
- **Multiple sessions** — start, switch between, rename (via first message), and delete conversations.
- **File attachment for context** — attach a small text/code/markdown file and it's included as context for that message.
- **Document export** — export any conversation as Markdown, PDF, plain text, or JSON.
- **Streaming responses**, markdown rendering, syntax-highlighted code blocks with one-click copy.

## Next-gen upgrade (new)

- **Agent modes / personas** — one-click switch between General, Research (verify-everything, tool-eager), Code (terse, verifies via `js_exec`/`py_exec` instead of guessing), and Creative (looser, less tool-happy) — each adjusts the system prompt and sampling temperature.
- **Cross-model second opinion** — optionally pick a *different* model in the sidebar to independently review the primary model's draft answer before it's shown to you. Two different providers rarely share the same blind spot; if the reviewer flags a concrete issue, the primary model gets one targeted revision pass.
- **New real tools**: `wikipedia` (direct, no-proxy Wikipedia summary lookup), `weather` (live current conditions + 4-day forecast via Open-Meteo, no API key), `json_query` (validate JSON and extract a value by path), and `image_gen` (real text-to-image generation via Puter's hosted model — the model embeds the returned URL as a markdown image, so it renders inline in chat).
- **Voice input** — a mic button next to the composer uses the browser's built-in speech recognition to transcribe speech straight into the message box (no server, no key; feature-detected, so it quietly disables itself on unsupported browsers).
- **Listen (text-to-speech)** — assistant replies get a "🔊 Listen" action that reads the answer aloud via Puter's hosted TTS, when available.
- **Command palette** — `⌘K` / `Ctrl+K` opens a fast, keyboard-first launcher for new session, theme, mode toggles, persona switches, and jumping straight to any past session by typing part of its name.
- **User profile & personalization** — a short, structured profile (name, role, response preferences) in the Memory panel is folded into every conversation's system context, distinct from the free-form auto-extracted facts list.
- **Session search & starring** — filter the session list by title or content, and star important conversations to keep them pinned to the top.
- **Backup & restore** — export everything (sessions, facts, profile, prefs) as one portable JSON file from the Memory panel, and re-import it later or on another device/browser; import merges by ID so it won't duplicate existing data.
- **One-retry network resilience** — a transient empty response or a dropped call to the model provider is retried once automatically before surfacing an error.



This is 100% static — there is no build step.

```
locxy-ai/
├── index.html
├── css/style.css
├── js/
│   ├── models.js     # Puter.js gateway wrapper
│   ├── memory.js      # sessions + facts, semantic recall, auto-summarization
│   ├── validate.js      # lightweight client-side code syntax checks
│   ├── tools.js           # real tools: web_search, web_fetch, calculator, js_exec, py_exec
│   ├── files.js             # multi-format upload processing (images/pdf/docx/xlsx/zip)
│   ├── agent.js                # plan → execute (w/ tools) → branch → synthesize → verify loop
│   ├── documents.js               # Markdown / PDF / DOCX / TXT / JSON / ZIP export
│   └── app.js                        # UI wiring
```

### Local preview
Just open `index.html` in a browser, or serve the folder with any static
server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

### Deploy to GitHub Pages
1. Create a repo (or use one you already have) named `<your-username>.github.io`
   for a root-level site, or any repo name for a project page.
2. Push these files to the repo's default branch.
3. In the repo, go to **Settings → Pages**, set the source branch to your
   default branch (root), and save.
4. Your app will be live at `https://<your-username>.github.io/` (or
   `https://<your-username>.github.io/<repo-name>/` for a project page)
   within a minute or two.

The first time a visitor uses the app, Puter.js will prompt them to sign in
to a free Puter account — that's what lets model calls run without you
hosting any backend or API keys.

## Next-gen upgrade, round 2 (new)

- **Visible reasoning ("Show thinking")** — a toggle asks the model to reason out loud first, rendered in a separate collapsible panel above the answer. This is a prompted reasoning trace (not the model provider's own private chain-of-thought), stated plainly so it isn't oversold.
- **Deep Research mode** — forces planning + tools on, allows more search/tool rounds, and requires the model to consult multiple independent sources, cross-check claims, and end with a "## Sources" section.
- **Team mode (multi-agent)** — splits the work across three sequential agents (Researcher → Writer → Critic) instead of one model doing everything; each hand-off is visible in the Trace tab, and the Critic can send the Writer back for one revision pass.
- **Live-editable canvas** — the Code panel now has a real "✎ Edit" mode: edit any opened code block directly, re-run the live preview against *your* edited version, or hand the edit back to Locxy with one click ("Ask Locxy to continue from this") — the artifact-editing loop ChatGPT Canvas / Claude Artifacts popularized.
- **Real Office file export** — Export session now also produces **.docx** (Word), **.xlsx** (Excel — one row per message, plus any markdown tables in replies get lifted into their own sheet), and **.pptx** (PowerPoint — one slide per message, chunked if long), alongside the existing Markdown/PDF/TXT/JSON.
- **Installable PWA** — a manifest + service worker cache the app shell, so Locxy AI can be installed to your home screen/dock and its UI still loads with no connection (past sessions are readable offline too, since they're in localStorage; live AI calls still need a connection).
- Vision (image understanding) was already wired in this build — attach an image and a vision-capable model will actually see it, not just read its filename.

## OpenRouter provider (optional, alongside Puter.js)

Locxy AI can now talk to **OpenRouter** directly from the browser — a second, independent model backend, with Puter.js remaining fully optional. Everything else in the app (agentic planning, tools, personas, deep research, team mode, memory, exports) works identically regardless of which provider you pick, since agent.js and tools.js only ever call `LocxyModels.chat()`/`listModels()` and don't know which backend answered.

**Setup (1 minute, free, no card required):**
1. Create an account at [openrouter.ai](https://openrouter.ai) and generate a key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. Open `key.js` and paste your key into the `window.OPENROUTER_API_KEYS` array. Repeat with additional OpenRouter accounts (up to ~5 is the useful range) to enable automatic key rotation — see below.
3. In the app, switch the **Provider** selector (top of the sidebar) to "OpenRouter (free models)".

### Multi-key rotation (for rate limits)

OpenRouter's free-tier limits are **per key**: 20 requests/minute, and 50/day unless that key's account has ever had $10+ in credits (then 1000/day). List more than one key in `key.js` and the app will:

- **Round-robin** across all keys on every request, spreading load evenly instead of hammering one key
- **Automatically pull a key out of rotation** the instant it gets rate-limited (429) or runs out of quota (402), for a cooldown window, while the others keep serving — you don't see the error as long as one key in the pool still has headroom
- Only surface an error once **every** key in the pool is exhausted at the same time

The sidebar shows live pool status ("3 OpenRouter keys loaded — rotating automatically", plus how many are currently cooling down). This is verified, not just described — a mocked-fetch test confirmed the app tries key 1, gets a 429, rotates to key 2, gets a 429, rotates to key 3, and succeeds, with keys 1 and 2 correctly marked as cooling down afterward.

Note: rotation only multiplies your effective budget if the keys come from **separate OpenRouter accounts** — multiple keys on the same account share that account's limits.

The model dropdown then fetches OpenRouter's live model catalogue and filters it down to models that are **genuinely $0 to use for chat** — every price field checked (prompt, completion, request, *and* image, since a model can have $0 token pricing but still charge per-image or a flat per-request fee), and non-chat models (rerank/embedding endpoints) excluded by id pattern since they'd fail against the chat endpoint this app actually calls. This isn't hardcoded, so it stays accurate as OpenRouter's free lineup rotates.

**How it works technically:** calls go straight from your browser to `https://openrouter.ai/api/v1/chat/completions` over `fetch()`, with streaming via SSE (OpenAI-compatible wire format) — no backend, no proxy, fully static, same architecture as everything else in this app.

**Security note (read `key.js` for the full version):** this is a static app, so any key you put in `key.js` ships as plain text in a browser-loaded file — anyone who can view the page's source can read it. That's a normal, accepted trade-off for a personal local tool; it's not something to do if you deploy this somewhere multi-user or public without changing the approach (put spend limits on the key, or proxy the calls through a server you control).

### Verified free models (research snapshot — the app's live list is authoritative)

The app always fetches and filters live, which is the real source of truth and stays current automatically — but here's an actual research snapshot, checked directly against `openrouter.ai/collections/free-models` and OpenRouter's own rate-limit docs, not guessed from memory:

| Model ID | Context | Notes |
|---|---|---|
| `tencent/hy3:free` | 262K | 295B MoE (21B active), reasoning + agentic workflows |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | Frontier-scale reasoning/orchestration, long-running agents |
| `poolside/laguna-m.1:free` | 262K | Flagship agentic **coding** model, tool calling |
| `nvidia/nemotron-3-super-120b-a12b:free` | 1M | High-efficiency MoE, strong on SWE-Bench/AIME |
| `cohere/north-mini-code:free` | 256K | Cohere's first agentic **coding** model |
| `poolside/laguna-xs-2.1:free` | 262K | Compact agentic coding model |
| `nvidia/nemotron-3-nano-30b-a3b:free` | 256K | Small, efficient, open weights |
| `openai/gpt-oss-20b:free` | 131K | OpenAI's open-weight model, Apache 2.0, function calling |
| `nvidia/nemotron-nano-9b-v2:free` | 128K | Unified reasoning/non-reasoning, controllable via system prompt |
| `google/gemma-4-31b-it:free` | 262K | Multimodal (text+image), 140+ languages |
| `google/gemma-4-26b-a4b-it:free` | 262K | MoE, multimodal incl. short video, near-31B quality |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | Multimodal: text/image/video/audio in one model |
| `nvidia/nemotron-nano-12b-v2-vl:free` | 128K | Vision/video understanding, document intelligence |

**Two things this research specifically caught, worth knowing:**
- OpenRouter's own "free models" collection page currently includes a model (a ByteDance image model) with $0 *text* pricing but a real **per-image charge** — not actually free for its main purpose. That's exactly why the app's filter checks all four price fields instead of just prompt/completion.
- A few genuinely $0-priced catalogue entries are **rerank/embedding** models, not chat models, and would fail against the chat endpoint this app uses — filtered out by id pattern so they never show up as a selectable "free model" that doesn't actually work as one.

**Rate limits** (from `openrouter.ai/docs/api-reference/limits`): 20 requests/minute on any `:free` model; 50 requests/day unless you've ever purchased $10+ in OpenRouter credits, after which it's 1000/day. Enforced by OpenRouter itself — a 429 now surfaces with that explanation directly in the app.

The free-model roster genuinely rotates — models get added, retired, or renamed without much notice, which is exactly why the app fetches live instead of shipping a hardcoded list.

## Notes and honest limitations

- **Tool execution runs in a Web Worker, not a full OS sandbox.** `js_exec`/`py_exec` code has no access to the DOM, `window`, or `localStorage` (a Worker's global scope doesn't include them) and is hard-terminated on a timeout, but it *does* have `fetch`/network access like any Worker does. This is model-generated code running in your own browser tab under your own session — treat it the way you'd treat any local code-execution tool, and don't run it against anything you wouldn't want a script touching.
- **`web_fetch` and `web_search` both depend on a third-party proxy** (`r.jina.ai`, a free reader service) since a static page can't do a plain server-side fetch itself and most sites block cross-origin requests directly. `web_search` points that proxy at a DuckDuckGo results page. If that service is down or rate-limits a request, the tool call will just fail and the model will say so.
- **`py_exec`'s first call per session is slow** — it lazily downloads the Pyodide (CPython/WASM) runtime, ~10MB, the first time Python is actually used.
- **This does not disable or bypass model safety behavior.** Puter.js routes
  to the real hosted models from each provider; their built-in safety
  behavior is not something a front-end wrapper can or should turn off.
- **Web search is real on OpenAI-family models.** Toggling it on sends
  `tools: [{type: "web_search"}]` to Puter, which performs a live search
  before answering — you'll see a "🔎 web search" badge on those replies.
  Puter only wires this tool up for OpenAI models today; on any other model
  the toggle instead falls back to a prompting mode that just asks the model
  to flag possibly-stale facts rather than claim false certainty.
- **Memory is local and best-effort.** Clearing browser storage, using a
  different browser, or private/incognito mode will lose it. There's a
  "Clear all" button in the sidebar for wiping it deliberately.
- **Agentic planning costs more tokens/time** than a direct answer, since it
  makes several model calls per response. It's a toggle for this reason —
  leave it off for quick questions.
- **"Run to completion" is a heuristic, not a guarantee.** It asks the model
  to judge its own output and continues if it looks unfinished, capped at 4
  rounds so one bad judgment call can't loop forever or run up a huge bill.
  It catches the common case (a big multi-file task getting cut short) but
  isn't a formal proof of correctness.
- **Syntax checking is intentionally shallow.** It safely parses JSON and
  plain JavaScript, and does a bracket-balance check for everything else —
  enough to catch obvious breakage, not a substitute for actually running
  the code. It never executes anything.
- **The code viewer displays and organizes code; the Preview tab is what
  actually runs it.** "Open" just shows a snippet full-size, syntax
  highlighted, read-only. "▶ Preview" (shown for HTML/SVG/CSS/JS/TS/JSX/TSX)
  is the one that executes it, inside a sandboxed `<iframe>` with no
  `allow-same-origin` — the artifact can't read this page's storage, cookies,
  or DOM, and can't reach further than any embedded page could. React
  previews load React/ReactDOM/Babel from a CDN inside that sandboxed frame
  only when you preview a JSX/TSX snippet, not on every page load.
- **File text extraction is best-effort and capped.** PDFs, Word docs, and
  spreadsheets are parsed in-browser (pdf.js, mammoth.js, SheetJS) with
  page/character caps so one huge file can't blow up a request — very long
  documents get truncated with a note, not silently dropped. Scanned PDFs
  with no embedded text layer won't yield extractable text. Uploading a
  100MB video or a proprietary binary format still attaches it by
  name/type/size only, since there's nowhere server-side to actually store
  or convert it.
- **Word (.docx) export is a straightforward HTML→docx conversion**
  (via html-docx-js) — good for headings, paragraphs, lists, tables, and
  bold/italic text; it won't reproduce more advanced formatting a real
  Word document could have.

## Staying signed in on mobile

Puter's browser SDK is designed so you sign in once and stay signed in
across visits — no API key or token needed or wanted in this file set. If
you're getting re-prompted on your phone but not on desktop, it's a mobile
browser storage quirk, not something the app is doing wrong:

- **If you "Add to Home Screen"**, that icon opens in its own isolated
  storage sandbox, separate from your regular browser tab. Signing in in
  Safari/Chrome doesn't carry over to the home-screen version, and vice
  versa — sign in from whichever one you actually use day to day.
- **iOS Safari's "Prevent Cross-Site Tracking"** (on by default) and
  Chrome Android's third-party storage limits can clear `js.puter.com`'s
  session data since it's a different origin than your `github.io` page —
  sometimes after a period of inactivity, sometimes on every tab close.
  If it's disruptive, add an exception for your site, or check whether
  your browser has a "clear cookies/site data on exit" setting enabled.
- **Private/incognito windows** never persist storage between sessions by
  design — that one's expected behavior, not a bug.

**Do not embed a Puter auth token (`init(authToken)`) in this app to work
around this.** That pattern exists for Node.js/server-side scripts, where
the token stays in an environment variable only your server can read. This
app is static files on GitHub Pages — anything in it, token included, is
plainly visible to any visitor via "View Source." A token with account
access baked into a public site can be copied and used by anyone as if
they were you. If you've ever pasted or committed a real token anywhere
outside your own machine, revoke it from your Puter dashboard and issue a
new one.

## Customizing

- Change the assistant's persona/instructions in `systemPreamble` inside
  `js/app.js`.
- Adjust the curated fallback model list or add favorites in
  `js/models.js`.
- Swap the color tokens at the top of `css/style.css` (`:root`) to re-theme.
