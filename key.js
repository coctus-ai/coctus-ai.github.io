/**
 * key.js — your OpenRouter API key(s), for the optional OpenRouter provider.
 *
 * SETUP
 * 1. Create a free account at https://openrouter.ai
 * 2. Generate a key at https://openrouter.ai/keys (starts with "sk-or-v1-...")
 * 3. Paste it into the array below. Repeat with a different OpenRouter
 *    account to add more keys — up to 5 is plenty for the automatic
 *    rotation this app does (see "KEY ROTATION" below); more than that
 *    has sharply diminishing returns since the daily cap is what usually
 *    matters most, not the per-minute one.
 * 4. In the app, open the "Provider" selector in the sidebar and switch to
 *    OpenRouter. The model list will populate with every currently-free
 *    (:free / $0-priced across every price field) model OpenRouter offers,
 *    fetched live from their public models API — no hardcoded list to go
 *    stale.
 *
 * You do NOT need this file at all if you're only using the Puter.js
 * provider (the default) — Puter handles its own auth via your Puter
 * account, no key required here.
 *
 * ── KEY ROTATION ────────────────────────────────────────────────────────
 * With more than one key listed, the app round-robins across them on every
 * request, and — this is the important part — the moment a specific key
 * gets rate-limited (HTTP 429) or runs out of quota (HTTP 402), that ONE
 * key is automatically pulled out of rotation for a cooldown window while
 * the others keep serving requests. You never see the error as long as at
 * least one key in the pool still has headroom; it's fully automatic, no
 * per-request code on your end.
 *
 * Why this actually helps: OpenRouter's free-tier limits are PER KEY —
 * 20 requests/minute, and 50/day unless that specific key's account has
 * ever had $10+ in credits (then 1000/day). Five separate keys (ideally
 * from five separate OpenRouter accounts — a key alone doesn't multiply
 * the limit if it's tied to the same account as another key) means up to
 * 5x the effective daily budget and much more headroom against the
 * per-minute ceiling during a burst of agentic tool-calling.
 *
 * This does NOT bypass or defeat OpenRouter's rate limiting — each key is
 * still fully subject to its own limits. It just means the app has more
 * than one bucket to draw from instead of stalling the moment the first
 * bucket empties, which is a standard, sanctioned way to use a
 * multi-account setup (nothing here spoofs identity, forges requests, or
 * evades any check OpenRouter performs — it's plain round-robin key
 * selection over keys you legitimately hold).
 * ───────────────────────────────────────────────────────────────────────
 *
 * ── SECURITY NOTE — please actually read this ──────────────────────────
 * This is a fully static, no-backend app. That means whatever keys you put
 * in THIS FILE ship as plain text inside a browser-loaded <script> file —
 * anyone who can load this page (view-source, browser DevTools, the
 * Network tab) can read them. This is true of ANY client-side/static app
 * with bundled keys; there is no JavaScript trick that hides a secret from
 * the browser running it.
 *
 * If you're deploying this publicly (GitHub Pages, Netlify, anywhere with
 * a public URL) — do NOT put real keys in this file. Leave it as the empty
 * template below (safe to commit as-is) and instead use the "OpenRouter"
 * key field in the app's own sidebar (Provider → OpenRouter). That field
 * saves to this browser's localStorage only — never to a file, never part
 * of the deployed page's source, never committed to the repo — so each
 * visitor (including you, from any device) enters their own key locally
 * and nothing is shared or exposed. This is the recommended path for a
 * public deployment, full stop.
 *
 * This file (with real keys pasted in) is only appropriate for a personal,
 * local copy you alone run — e.g. cloned straight to your own machine, or
 * a private repo — never committed public, never deployed to a public URL.
 *
 * Either way:
 *   - set spend/rate limits on each key at https://openrouter.ai/settings/keys
 *     (OpenRouter supports per-key credit limits — use them)
 *   - or better: proxy OpenRouter calls through a small server you control,
 *     so no key ever reaches the browser at all
 * ─────────────────────────────────────────────────────────────────────
 */
window.OPENROUTER_API_KEYS = [
  // 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // key 1
  // 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // key 2
  // 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // key 3
  // 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // key 4
  // 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // key 5
];

// Backward-compatible single-key form still works too — either fill this
// in, or use the array above, or both (they get merged and de-duplicated).
window.OPENROUTER_API_KEY = '';
