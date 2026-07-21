/**
 * agent.js — the agentic loop. Has actual hands, not just a plan:
 *
 *  1. Plan — short JSON plan for non-trivial requests (skipped for simple ones).
 *  2. Execute — each step runs through a ReAct tool loop: the model can call
 *     web_fetch / calculator / js_exec / py_exec (see tools.js) as many times
 *     as it needs before writing that step's notes, instead of only ever
 *     guessing from training data.
 *  3. Branch — after the planned steps, Coctus asks itself once whether a
 *     concrete gap remains and, if so, runs up to 2 extra ad-hoc steps to
 *     close it — the plan isn't fixed once drafted.
 *  4. Synthesize — everything is written into one final answer, streamed
 *     into the chat.
 *  5. Verify — a separate pass checks the drafted answer against the
 *     request and the tool outputs actually gathered, and triggers one
 *     revision round if it finds a concrete, fixable problem.
 *  6. Run to completion — checks whether a multi-part answer actually
 *     finished, and continues if not, up to a safety cap.
 *  7. Syntax check — lightweight client-side check + auto-fix on code
 *     blocks in the final answer.
 *
 * A `signal` (a plain `{ cancelled: false }` object, shared by reference
 * with the caller) can be passed to `run()` — flipping `.cancelled = true`
 * cooperatively aborts the loop at the next model call, wherever it is.
 */

const CoctusAgent = (() => {

  const MAX_STEPS = 6;
  const MAX_CONTINUATIONS = 20;
  const MAX_TOOL_CALLS_PER_TURN = 6;
  const MAX_DYNAMIC_STEPS = 2;
  // Internal (non-user-facing) QUALITY calls per turn — gap-check, verifier,
  // critic. Kept on a tight budget because these are nice-to-haves, not
  // required to finish the answer, and are what actually used to run away
  // and burn a free-tier rate limit (20/min, 50/day on OpenRouter). The
  // run-to-completion loop below is deliberately NOT gated by this budget —
  // finishing a genuinely big, multi-part answer is the actual point of
  // that loop, so it gets its own generous cap (MAX_CONTINUATIONS) instead.
  const MAX_INTERNAL_CALLS = 6;
  const INTERNAL_RETRY_DELAY_MS = 700;

  /** One retry, short fixed backoff, for internal helper calls whose only
   * fallback on failure is a conservative default (e.g. "assume OK", "assume
   * complete") — a single transient hiccup shouldn't silently downgrade
   * quality when a quick retry would likely succeed. */
  async function withRetry(fn, signal) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      if (signal && signal.cancelled) throw err;
      await new Promise(r => setTimeout(r, INTERNAL_RETRY_DELAY_MS));
      if (signal && signal.cancelled) throw err;
      return fn();
    }
  }

  function trivialMessage(text) {
    const t = text.trim();
    return t.length < 24 && /^(hi|hey|hello|thanks|thank you|ok|okay|yo|sup|good morning|good night)\b/i.test(t);
  }

  function extractJson(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(text.slice(start, end + 1)); }
    catch { return null; }
  }

  function extractCodeBlocks(text) {
    const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    const blocks = [];
    let m;
    while ((m = re.exec(text))) blocks.push({ lang: m[1] || '', code: m[2], full: m[0], index: m.index });
    return blocks;
  }

  const TOOL_SYSTEM_BLOCK = () => `
You have real tools available — use them instead of guessing whenever they'd give a better answer:
${CoctusTools.describeAll()}
To use a tool, respond with ONLY a single line, nothing else:
TOOL_CALL: {"tool": "<name>", "args": {...}}
You'll get the result back and can call another tool or give your real answer. When you're done using tools (or don't need any), respond normally with your actual answer — do not mention "TOOL_CALL" or tool mechanics to the user, just use the results naturally.`;

  /**
   * Finds a well-formed JSON object starting at `from` by counting braces
   * (respecting strings/escapes), instead of a greedy lastIndexOf('}') —
   * which breaks the moment there's more than one top-level brace anywhere
   * after it (e.g. the model echoes an example, or appends a sentence with
   * "{...}" in it after the real call).
   */
  function matchJsonObject(text, from) {
    let depth = 0, inStr = false, esc = false;
    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return text.slice(from, i + 1); }
    }
    return null;
  }

  /**
   * Robust tool-call detection: the model is asked to respond with ONLY a
   * "TOOL_CALL: {...}" line, but real models frequently don't follow that
   * exactly — they add a lead-in sentence, wrap it in a markdown fence, or
   * follow it with a trailing note. This scans the whole response for a
   * "TOOL_CALL:" marker anywhere, brace-matches the JSON object that
   * follows it (ignoring any prose before/after), and only treats the rest
   * of the message as a real final answer if no such marker is found at
   * all. This single fix is what makes the ReAct loop actually reliable
   * across different models instead of silently skipping tool use.
   */
  function parseToolCall(text) {
    const idx = text.search(/TOOL_CALL\s*:/i);
    if (idx === -1) return null;
    const braceStart = text.indexOf('{', idx);
    if (braceStart === -1) return null;
    const jsonStr = matchJsonObject(text, braceStart);
    if (!jsonStr) return null;
    try {
      const obj = JSON.parse(jsonStr);
      if (obj && typeof obj.tool === 'string') return obj;
    } catch {}
    return null;
  }

  /**
   * Runs a ReAct-style loop for ONE logical turn: call the model, and if it
   * asks for a tool, run the tool and call again, up to a cap. Returns the
   * final non-tool-call text, streamed to `onToken` in real time.
   *
   * Two implementations, picked automatically per model:
   *  - reactLoopNative: OpenRouter's structured `tools` param (see
   *    models.js chatTool). No ambiguity between "answer" and "tool call" —
   *    they arrive as separate fields — so the real answer streams live
   *    with no guessing. Preferred whenever available.
   *  - reactLoopText: the "TOOL_CALL: {...}" text protocol, for Puter and
   *    any OpenRouter model that rejects the `tools` param. Uses a
   *    reveal-buffering trick (see callModel below) to still stream in
   *    real time despite the ambiguity.
   */
  async function reactLoop(baseMessages, opts = {}) {
    const effectiveProvider = opts.provider || CoctusModels.getProvider();
    const native = effectiveProvider === CoctusModels.PROVIDERS.OPENROUTER
      && !CoctusModels.hasNoToolSupport(opts.model);
    return native ? reactLoopNative(baseMessages, opts) : reactLoopText(baseMessages, opts);
  }

  async function reactLoopNative(baseMessages, { model, temperature, signal, onToolCall, onToken, maxToolCalls, provider } = {}) {
    let messages = baseMessages.slice();
    const cap = maxToolCalls || MAX_TOOL_CALLS_PER_TURN;
    const specs = CoctusTools.toolSpecs();
    for (let i = 0; i < cap; i++) {
      const isLast = i === cap - 1;
      let res;
      try {
        res = await CoctusModels.chatTool(messages, { model, temperature, signal, tools: isLast ? undefined : specs, onToken, provider });
      } catch (err) {
        if (err instanceof CoctusModels.CancelledError) throw err;
        // Fall back to the text protocol for the rest of THIS turn rather
        // than failing it outright — a transient tool-calling error on an
        // otherwise-working model shouldn't lose the whole response.
        return reactLoopText(messages, { model, temperature, signal, onToolCall, onToken, maxToolCalls: cap - i, provider });
      }
      const { text, toolCalls } = res;
      if (!toolCalls || !toolCalls.length) return text; // real answer — already streamed via onToken
      messages = messages.concat([{
        role: 'assistant', content: text || null,
        tool_calls: toolCalls.map((tc, idx) => ({
          id: tc.id || `call_${i}_${idx}`, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        })),
      }]);
      for (let idx = 0; idx < toolCalls.length; idx++) {
        const tc = toolCalls[idx];
        const callId = tc.id || `call_${i}_${idx}`;
        onToolCall && onToolCall({ tool: tc.name, args: tc.args }, null);
        const result = await CoctusTools.run(tc.name, tc.args);
        onToolCall && onToolCall({ tool: tc.name, args: tc.args }, result);
        messages.push({
          role: 'tool', tool_call_id: callId,
          content: result.ok ? String(result.result) : `Error: ${result.error}`,
        });
      }
    }
    const forced = await CoctusModels.chatTool(
      messages.concat([{ role: 'user', content: 'Tool budget for this turn is used up — give your best answer now using what you already have, with no more tool calls.' }]),
      { model, temperature, signal, onToken, provider }
    );
    return forced.text;
  }

  /**
   * Streams a single model call for the text-protocol path. When the
   * response MIGHT be a "TOOL_CALL: {...}" line, visible output is held
   * back until enough text has arrived to be reasonably sure it isn't one
   * (no "TOOL_CALL:" marker seen yet, and either a newline or ~16+
   * characters in) — at which point everything buffered so far is flushed
   * at once and the rest streams live from there. This is what makes
   * tool-enabled replies on the text protocol type out in real time
   * instead of appearing all at once only after the whole turn finishes.
   */
  async function callModel(messages, chatOpts, onToken, mightBeToolCall) {
    if (!onToken) return CoctusModels.chat(messages, chatOpts);
    if (!mightBeToolCall) return CoctusModels.chat(messages, { ...chatOpts, onToken });
    let revealed = false;
    const full = await CoctusModels.chat(messages, {
      ...chatOpts,
      onToken: (chunk, fullSoFar) => {
        if (revealed) { onToken(chunk, fullSoFar); return; }
        if (/TOOL_CALL\s*:/i.test(fullSoFar)) return; // still looks like it could be a tool call
        if (fullSoFar.length < 16 && !/\n/.test(fullSoFar)) return; // not enough signal yet
        revealed = true;
        onToken(fullSoFar, fullSoFar); // flush the buffered backlog as the first visible chunk
      },
    });
    if (!revealed && !/TOOL_CALL\s*:/i.test(full)) onToken(full, full); // short answer that never crossed the threshold
    return full;
  }

  async function reactLoopText(baseMessages, { model, temperature, webSearch, signal, onToolCall, onToken, maxToolCalls, provider } = {}) {
    let messages = baseMessages.slice();
    const cap = maxToolCalls || MAX_TOOL_CALLS_PER_TURN;
    for (let i = 0; i < cap; i++) {
      const isLast = i === cap - 1;
      const probe = await callModel(messages, { model, temperature, webSearch, signal, provider }, onToken, !isLast);
      const call = !isLast ? parseToolCall(probe) : null;
      if (!call) return probe;
      onToolCall && onToolCall(call, null);
      const result = await CoctusTools.run(call.tool, call.args);
      onToolCall && onToolCall(call, result);
      messages = messages.concat([
        { role: 'assistant', content: probe },
        { role: 'user', content: result.ok
            ? `[Tool result for ${call.tool}]\n${result.result}`
            : `[Tool "${call.tool}" failed]\n${result.error}\nTry a different approach or proceed without it.` },
      ]);
    }
    return callModel(
      messages.concat([{ role: 'user', content: 'Tool budget for this turn is used up — give your best answer now using what you already have, with no more tool calls.' }]),
      { model, temperature, webSearch, signal, provider }, onToken, false
    );
  }

  async function planFor(userText, model, signal, stepCap) {
    stepCap = stepCap || MAX_STEPS;
    const sys = `You are Coctus AI's internal planner. Given a user request, decide if it needs a short multi-step approach.
Respond with ONLY compact JSON, no prose, no markdown fences, in this exact shape:
{"discussion": "1-2 sentences: your read on what's actually being asked and the approach you'll take", "needsPlan": boolean, "goal": "one line restating the objective", "steps": [{"title": "3-6 word step name", "detail": "one short sentence on what this step does"}]}
Rules:
- discussion is always present, even when needsPlan is false — it's shown to the user as a quick "here's what I understood" before the real answer, so make it genuinely reflect THIS request, not a generic filler line.
- needsPlan is false for greetings, simple factual questions, or anything answerable in one direct paragraph.
- When true, produce at most ${stepCap} steps, ordered logically (e.g. clarify scope, gather/derive facts, draft, verify).
- Keep every field short. No step should restate the whole task.`;

    try {
      const raw = await withRetry(() => CoctusModels.chat(
        [{ role: 'system', content: sys }, { role: 'user', content: userText }],
        { model, temperature: 0.2, signal }
      ), signal);
      const json = extractJson(raw);
      if (json && typeof json.needsPlan === 'boolean') return json;
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      console.warn('Coctus: planning step failed, continuing without a plan.', err);
    }
    return { discussion: '', needsPlan: false, goal: userText, steps: [] };
  }

  /** After the planned steps run out, check for one concrete remaining gap. */
  async function checkGap(goal, scratchpad, model, signal) {
    const sys = `You are Coctus AI's internal gap-checker. Given the goal and the working notes gathered so far, decide if there's ONE concrete, specific piece of information or verification still missing before a good final answer can be written.
Reply with ONLY one line: either "NONE" or "STEP: <one short imperative step description>".
Be conservative — most of the time the answer is NONE. Only propose a step if something concrete and checkable is actually missing (e.g. a fact that was never verified, a file that was never inspected, a calculation never actually run).`;
    try {
      const raw = await withRetry(() => CoctusModels.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `Goal: ${goal}\n\nNotes so far:\n${scratchpad.join('\n\n')}` },
      ], { model, temperature: 0.2, signal }), signal);
      const line = raw.trim();
      const m = line.match(/^STEP:\s*(.+)/i);
      return m ? { needed: true, title: m[1].slice(0, 80) } : { needed: false };
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      return { needed: false };
    }
  }

  /** Verifier pass: sanity-check the drafted answer once. */
  async function verifyAnswer(userText, answer, scratchpad, model, signal) {
    const sys = `You are Coctus AI's internal verifier. You'll see a user's request, the working notes gathered (including any real tool outputs), and a drafted final answer. Check the answer for concrete, fixable problems: claims that contradict the gathered tool output, requirements from the request that were silently dropped, or code that clearly can't be what was asked for.
Reply with ONLY one line: either "OK" or "ISSUES: <one short, concrete, actionable sentence describing what to fix>".
Be conservative — most answers are OK. Do not nitpick style or completeness that wasn't actually requested.`;
    try {
      const raw = await withRetry(() => CoctusModels.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `User's request:\n${userText}\n\nWorking notes / tool outputs:\n${scratchpad.join('\n\n') || '(none)'}\n\nDrafted answer:\n${answer}` },
      ], { model, temperature: 0, signal }), signal);
      const line = raw.trim();
      const m = line.match(/^ISSUES:\s*(.+)/i);
      return m ? { ok: false, issue: m[1] } : { ok: true };
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      return { ok: true };
    }
  }

  async function checkAndFixCode(text, model, signal, onNote) {
    const blocks = extractCodeBlocks(text);
    if (!blocks.length) return text;
    let updated = text;
    for (const block of blocks) {
      let result = CoctusValidate.check(block.code, block.lang);
      if (result.ok) continue;
      let code = block.code;
      // Up to 2 attempts: fix, re-validate the fix itself, and if it's
      // STILL broken, feed the new error back in for a second try — rather
      // than trusting a single fix pass blindly, which could just as
      // easily replace one syntax error with another.
      for (let attempt = 0; attempt < 2; attempt++) {
        onNote && onNote(`Fixing a syntax issue in a ${block.lang || 'code'} block: ${result.message}`);
        try {
          const fixed = await CoctusModels.chat([
            { role: 'system', content: `You fix broken code. You will be given one code block that failed a syntax check with error: "${result.message}". Return ONLY the corrected code, no explanation, no markdown fences.` },
            { role: 'user', content: code },
          ], { model, temperature: 0, signal });
          code = fixed.replace(/^```[a-zA-Z0-9_+-]*\n?/, '').replace(/```\s*$/, '').trim();
          result = CoctusValidate.check(code, block.lang);
          if (result.ok) break;
        } catch (err) {
          if (err instanceof CoctusModels.CancelledError) throw err;
          console.warn('Coctus: auto-fix pass failed for a code block.', err);
          break;
        }
      }
      if (code !== block.code) {
        const replacement = '```' + block.lang + '\n' + code + '\n```';
        updated = updated.replace(block.full, replacement);
      }
    }
    return updated;
  }

  async function checkCompletion(userText, answerSoFar, model, signal) {
    const sys = `You are Coctus AI's internal completion checker. You'll see a user's request and a drafted response. Decide if the response is genuinely finished — nothing left unwritten, no "..." or "continue in next part", no truncated code or lists, no explicitly promised-but-missing sections.
Reply with ONLY one line: either "COMPLETE" or "CONTINUE: <one short sentence on what's missing>".
Be conservative — most reasonable, self-contained answers are COMPLETE. Only say CONTINUE if something is genuinely, concretely unfinished.`;
    try {
      const raw = await withRetry(() => CoctusModels.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `User's request:\n${userText}\n\nDrafted response:\n${answerSoFar}` },
      ], { model, temperature: 0, signal }), signal);
      const line = raw.trim();
      if (/^CONTINUE/i.test(line)) return { complete: false, reason: line.replace(/^CONTINUE:?\s*/i, '') };
      return { complete: true };
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      return { complete: true };
    }
  }

  /**
   * Cross-model second opinion: asks a DIFFERENT model to critique the
   * primary model's draft answer. Two different providers are less likely
   * to share the same blind spot, so this catches a different class of
   * mistake than same-model self-verification. Only runs when a distinct
   * critic model is supplied.
   */
  async function crossCheckAnswer(userText, answer, criticModel, signal) {
    const sys = `You are an independent second reviewer, a different model from the one that wrote this answer. Read the user's request and the draft answer. Look for factual errors, logical mistakes, or unmet requirements.
Reply with ONLY one line: either "OK" or "ISSUES: <one short, concrete, actionable sentence describing what to fix>".`;
    try {
      const raw = await withRetry(() => CoctusModels.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `User's request:\n${userText}\n\nDraft answer to review:\n${answer}` },
      ], { model: criticModel, temperature: 0, signal }), signal);
      const line = raw.trim();
      const m = line.match(/^ISSUES:\s*(.+)/i);
      return m ? { ok: false, issue: m[1] } : { ok: true };
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      return { ok: true };
    }
  }

  /**
   * Runs the full loop.
   * callbacks: { onPlan(plan), onStepStart(i), onStepDone(i, note), onStepToken(i, chunk, full),
   *              onToken(chunk, full), onRound(n, reason), onNote(text), onToolCall(call, result) }
   * Returns the final answer text. If cancelled mid-flight, throws
   * CoctusModels.CancelledError — callers should catch it and treat whatever
   * partial text they already streamed via onToken as the final result.
   */
  async function run({ history, userText, userContent, model, execModel, execProvider, systemPreamble, agentic, webSearch, runToCompletion, tools, signal, criticModel, temperature, deepResearch, showThinking, callbacks = {} }) {
    signal = signal || { cancelled: false };
    const runExecModel = execModel || model; // no execModel given → single-model behavior, unchanged
    if (deepResearch) { agentic = true; tools = true; runToCompletion = true; }
    const baseSystem = (systemPreamble || 'You are Coctus AI, a capable, direct, and honest assistant.')
      + (tools ? '\n' + TOOL_SYSTEM_BLOCK() : '')
      + (deepResearch ? `\n\nYou are in Deep Research mode: this deserves real investigative rigor, not a quick answer. Consult multiple independent sources (aim for at least 3-4 distinct ones — combine web_search, web_fetch, and wikipedia; follow up on promising links with web_fetch rather than trusting a snippet alone), cross-check claims that matter, and note where sources disagree instead of picking one silently. The final answer must be a well-structured report (headings, not just paragraphs) and must end with a "## Sources" section listing every URL/reference actually used.` : '');
    // Applied only to prompts that produce the user-facing answer — NOT to
    // internal step/critic/verifier prompts, which must stay plain scratch text.
    const thinkingBlock = showThinking
      ? `\n\nBefore your real answer, think out loud first, wrapped in <thinking>...</thinking> tags: work through the request, weigh approaches, catch your own mistakes. Be genuine and specific, not a token summary. Then give the final answer wrapped in <answer>...</answer> tags. Always include both tags, in that order, exactly once each — the thinking block is shown to the user as your reasoning trace, so don't tell them to "wait" for it, it's already visible.`
      : '';
    const finalUserContent = userContent !== undefined ? userContent : userText;
    let accumulated = '';
    const allNotes = [];
    // Shared budget for internal (non-user-facing) calls made AFTER the
    // core plan/step/synthesis work: gap-checks, verifier, critic,
    // completion-check rounds. Once exhausted, later stages are skipped
    // outright (treated as "no issue found") rather than firing anyway —
    // this is what stops a single message from cascading into a dozen+
    // requests and tripping a free-tier rate limit mid-answer.
    const internalBudget = { left: MAX_INTERNAL_CALLS };
    const spend = () => { if (internalBudget.left <= 0) return false; internalBudget.left--; return true; };

    function onToken(chunk, fullThisCall) {
      callbacks.onToken && callbacks.onToken(chunk, accumulated + fullThisCall);
    }

    async function streamOneCall(messages, extraOpts = {}) {
      const opts = { temperature, ...extraOpts };
      callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null });
      if (tools) {
        const full = await reactLoop(messages, {
          model: runExecModel, temperature: opts.temperature, webSearch, signal, provider: execProvider,
          onToolCall: callbacks.onToolCall, onToken,
        });
        accumulated += full;
        return full;
      }
      const full = await CoctusModels.chat(messages, { model: runExecModel, webSearch, signal, onToken, provider: execProvider, ...opts });
      accumulated += full;
      return full;
    }

    const isTrivial = !deepResearch && trivialMessage(userText);
    const stepCap = deepResearch ? 8 : MAX_STEPS;
    const roundCap = deepResearch ? 20 : MAX_CONTINUATIONS;
    const toolCallCap = deepResearch ? 10 : MAX_TOOL_CALLS_PER_TURN;

    if (!agentic || isTrivial) {
      callbacks.onPlan && callbacks.onPlan(null);
      const messages = [{ role: 'system', content: baseSystem + thinkingBlock }, ...history, { role: 'user', content: finalUserContent }];
      await streamOneCall(messages);
    } else {
      const plan = await planFor(userText, model, signal, stepCap);
      if (plan.discussion) callbacks.onPhase && callbacks.onPhase('discuss', plan.discussion);
      if (deepResearch && (!plan.needsPlan || !plan.steps || !plan.steps.length)) {
        plan.needsPlan = true;
        plan.goal = plan.goal || userText;
        plan.steps = [
          { title: 'Survey the topic', detail: 'Broad search to map out what sources exist and what the key sub-questions are.' },
          { title: 'Gather from multiple sources', detail: 'Pull specifics from at least 2-3 independent sources, following links for real detail rather than trusting snippets.' },
          { title: 'Cross-check & reconcile', detail: 'Compare what different sources say, flag disagreements or uncertainty.' },
          { title: 'Draft the report', detail: 'Organize findings into a structured report with headings and a Sources section.' },
        ];
      }
      if (!plan.needsPlan || !plan.steps || !plan.steps.length) {
        callbacks.onPlan && callbacks.onPlan(null);
        const messages = [{ role: 'system', content: baseSystem + thinkingBlock }, ...history, { role: 'user', content: finalUserContent }];
        await streamOneCall(messages);
      } else {
        callbacks.onPhase && callbacks.onPhase('plan', plan);
        callbacks.onPlan && callbacks.onPlan(plan);

        const scratchpad = [];
        const runStep = async (i, step) => {
          callbacks.onStepStart && callbacks.onStepStart(i);
          callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null, step: i });
          const stepSystem = `${baseSystem}
You are working through step ${i + 1} of an internal plan for the user's request.
Overall goal: ${plan.goal}
This step: "${step.title}" — ${step.detail || ''}
Write only the working notes/output for THIS step — concise, substantive, no restating the instructions. Use tools if they'd actually help. This is scratch work, not the final reply to the user.`;
          const stepMessages = [
            { role: 'system', content: stepSystem },
            ...history,
            { role: 'user', content: userText },
            ...(scratchpad.length ? [{ role: 'assistant', content: 'Notes so far:\n' + scratchpad.join('\n\n') }] : []),
          ];
          let note = '';
          const stepToken = callbacks.onStepToken
            ? (chunk, full) => callbacks.onStepToken(i, chunk, full)
            : null;
          try {
            note = tools
              ? await reactLoop(stepMessages, { model: runExecModel, temperature: 0.4, webSearch, signal, provider: execProvider, onToolCall: callbacks.onToolCall, onToken: stepToken, maxToolCalls: toolCallCap })
              : await CoctusModels.chat(stepMessages, { model: runExecModel, temperature: 0.4, webSearch, signal, onToken: stepToken, provider: execProvider });
          } catch (err) {
            if (err instanceof CoctusModels.CancelledError) throw err;
            note = `(step failed: ${err.message})`;
          }
          const entry = `Step ${i + 1} — ${step.title}: ${note}`;
          scratchpad.push(entry);
          allNotes.push(entry);
          callbacks.onStepDone && callbacks.onStepDone(i, note);
        };

        for (let i = 0; i < plan.steps.length; i++) await runStep(i, plan.steps[i]);

        // ---- Dynamic branching: check for a real gap, run up to 2 extra steps ----
        let stepIdx = plan.steps.length;
        for (let extra = 0; extra < MAX_DYNAMIC_STEPS; extra++) {
          if (!spend()) break;
          const gap = await checkGap(plan.goal, scratchpad, model, signal);
          if (!gap.needed) break;
          plan.steps.push({ title: gap.title, detail: 'Added dynamically to close a gap found after the initial plan.' });
          callbacks.onPlan && callbacks.onPlan(plan);
          await runStep(stepIdx, plan.steps[stepIdx]);
          stepIdx++;
        }

        const finalSystem = `${baseSystem}
You just worked through an internal plan to prepare for this reply. Use the notes below as grounding, but do NOT mention "steps", "the plan", or that you followed a process — just give the user a well-organized, direct final answer as if you thought it through naturally.
Internal notes:
${scratchpad.join('\n\n')}${thinkingBlock}`;
        const finalMessages = [{ role: 'system', content: finalSystem }, ...history, { role: 'user', content: finalUserContent }];
        await streamOneCall(finalMessages);
      }
    }

    // ---- Verifier pass (once) ----
    if (!isTrivial && accumulated.trim() && spend()) {
      callbacks.onPhase && callbacks.onPhase('review', { model });
      const verdict = await verifyAnswer(userText, accumulated, allNotes, model, signal);
      if (!verdict.ok) {
        callbacks.onNote && callbacks.onNote(`Revising — ${verdict.issue}`);
        callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null });
        const revised = await CoctusModels.chat([
          { role: 'system', content: `${baseSystem}\nYou wrote a draft answer that an internal check flagged a concrete issue with: "${verdict.issue}". Rewrite the full answer, fixing that issue. Output only the corrected final answer — no meta-commentary about the fix.` },
          ...history,
          { role: 'user', content: finalUserContent },
          { role: 'assistant', content: accumulated },
        ], { model: runExecModel, temperature: 0.3, signal, provider: execProvider });
        if (revised && revised.trim()) {
          accumulated = revised;
          callbacks.onToken && callbacks.onToken('', accumulated);
        }
      }
    }

    // ---- Cross-model second opinion (optional, only if a distinct critic model was picked) ----
    if (!isTrivial && accumulated.trim() && criticModel && criticModel !== model && spend()) {
      callbacks.onPhase && callbacks.onPhase('review', { model: criticModel });
      callbacks.onNote && callbacks.onNote(`Getting a second opinion from ${criticModel}…`);
      const verdict2 = await crossCheckAnswer(userText, accumulated, criticModel, signal);
      if (!verdict2.ok) {
        callbacks.onNote && callbacks.onNote(`Second opinion flagged — ${verdict2.issue}`);
        callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null });
        const revised = await CoctusModels.chat([
          { role: 'system', content: `${baseSystem}\nAn independent second-opinion reviewer (a different model) flagged a concrete issue with your draft: "${verdict2.issue}". Rewrite the full answer, fixing that issue. Output only the corrected final answer — no meta-commentary about the fix.` },
          ...history,
          { role: 'user', content: finalUserContent },
          { role: 'assistant', content: accumulated },
        ], { model: runExecModel, temperature: 0.3, signal, provider: execProvider });
        if (revised && revised.trim()) {
          accumulated = revised;
          callbacks.onToken && callbacks.onToken('', accumulated);
        }
      }
    }

    // ---- Run-to-completion loop ----
    if (runToCompletion && !isTrivial) {
      let round = 0;
      while (round < roundCap) {
        callbacks.onPhase && callbacks.onPhase('review', { model });
        const check = await checkCompletion(userText, accumulated, model, signal);
        if (check.complete) break;
        round++;
        callbacks.onRound && callbacks.onRound(round, check.reason);
        const continueMessages = [
          { role: 'system', content: `${baseSystem}\nYou are continuing your own previous response, which was cut off or left something unfinished (${check.reason || 'incomplete'}). Continue seamlessly from exactly where it left off — do not repeat any earlier content, do not restart, do not add a preamble like "continuing..." — just keep writing.` },
          ...history,
          { role: 'user', content: userText },
          { role: 'assistant', content: accumulated },
          { role: 'user', content: 'Continue.' },
        ];
        const before = accumulated;
        await streamOneCall(continueMessages);
        if (accumulated.length - before.length < 4) break;
      }
    }

    // ---- Syntax verification + auto-fix pass ----
    if (!isTrivial) {
      const fixed = await checkAndFixCode(accumulated, model, signal, (note) => callbacks.onNote && callbacks.onNote(note));
      if (fixed !== accumulated) {
        accumulated = fixed;
        callbacks.onToken && callbacks.onToken('', accumulated);
      }
    }

    return accumulated;
  }

  /**
   * Team mode: three specialized agents collaborate sequentially instead of
   * one model doing everything — a Researcher gathers grounded facts (using
   * real tools), a Writer drafts the deliverable from those facts, and a
   * Critic reviews the draft against the brief before one revision pass.
   * Reuses the same onPlan/onStepStart/onStepDone callbacks as run() so the
   * existing trace panel renders the collaboration with no new UI plumbing.
   */
  async function runTeam({ history, userText, userContent, model, execModel, execProvider, systemPreamble, webSearch, tools, signal, callbacks = {} }) {
    signal = signal || { cancelled: false };
    const runExecModel = execModel || model;
    const baseSystem = systemPreamble || 'You are Coctus AI, a capable, direct, and honest assistant.';
    const finalUserContent = userContent !== undefined ? userContent : userText;
    const toolBlock = tools ? '\n' + TOOL_SYSTEM_BLOCK() : '';

    const roles = [
      { title: 'Researcher', detail: 'Gathers grounded facts and context for the request, using tools where they help.' },
      { title: 'Writer', detail: 'Drafts the actual deliverable from the researcher\'s findings.' },
      { title: 'Critic', detail: 'Reviews the draft against the original request and flags concrete problems.' },
    ];
    callbacks.onPlan && callbacks.onPlan({ goal: userText, steps: roles });

    // ---- Researcher ----
    callbacks.onStepStart && callbacks.onStepStart(0);
    const researcherSystem = `${baseSystem}${toolBlock}
You are the RESEARCHER in a three-agent team (Researcher → Writer → Critic). Your only job: gather and state the concrete facts, context, and constraints relevant to the user's request below. Use tools if they'd genuinely help. Do NOT write the final deliverable — write a tight, factual research brief for the Writer agent to use.`;
    const researcherMessages = [{ role: 'system', content: researcherSystem }, ...history, { role: 'user', content: finalUserContent }];
    let brief = '';
    const researchToken = callbacks.onStepToken ? (chunk, full) => callbacks.onStepToken(0, chunk, full) : null;
    try {
      brief = tools
        ? await reactLoop(researcherMessages, { model, temperature: 0.3, webSearch, signal, onToolCall: callbacks.onToolCall, onToken: researchToken, maxToolCalls: MAX_TOOL_CALLS_PER_TURN })
        : await CoctusModels.chat(researcherMessages, { model, temperature: 0.3, webSearch, signal, onToken: researchToken });
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      brief = `(research phase failed: ${err.message} — proceeding without it)`;
    }
    callbacks.onStepDone && callbacks.onStepDone(0, brief);

    // ---- Writer (execution phase — hybrid runs use the execution model here) ----
    callbacks.onStepStart && callbacks.onStepStart(1);
    callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null });
    const writerSystem = `${baseSystem}
You are the WRITER in a three-agent team (Researcher → Writer → Critic). The Researcher has prepared the brief below — use it as grounding. Produce the actual, complete final deliverable the user asked for. Do not mention "the researcher", "the brief", or the team process — just deliver a well-organized, direct answer.
Research brief:
${brief}`;
    const writerMessages = [{ role: 'system', content: writerSystem }, ...history, { role: 'user', content: finalUserContent }];
    let draft = '';
    let streamed = '';
    try {
      draft = await CoctusModels.chat(writerMessages, {
        model: runExecModel, temperature: 0.5, webSearch, signal, provider: execProvider,
        onToken: (chunk, full) => { streamed = full; callbacks.onToken && callbacks.onToken(chunk, full); },
      });
    } catch (err) {
      if (err instanceof CoctusModels.CancelledError) throw err;
      throw err;
    }
    if (!draft) draft = streamed;
    callbacks.onStepDone && callbacks.onStepDone(1, 'Draft complete.');

    // ---- Critic (review phase — always the primary model) ----
    callbacks.onStepStart && callbacks.onStepStart(2);
    callbacks.onPhase && callbacks.onPhase('review', { model });
    const critic = await verifyAnswer(userText, draft, [brief], model, signal);
    let final = draft;
    if (!critic.ok) {
      callbacks.onStepDone && callbacks.onStepDone(2, `Flagged: ${critic.issue} — Writer is revising.`);
      callbacks.onNote && callbacks.onNote(`Critic flagged an issue — ${critic.issue}`);
      callbacks.onPhase && callbacks.onPhase('execute', { model: runExecModel, provider: execProvider || null });
      const revised = await CoctusModels.chat([
        { role: 'system', content: `${writerSystem}\n\nThe Critic agent reviewed your draft and flagged a concrete issue: "${critic.issue}". Rewrite the full deliverable, fixing that issue. Output only the corrected final version — no meta-commentary about the fix or the review process.` },
        ...history,
        { role: 'user', content: finalUserContent },
        { role: 'assistant', content: draft },
      ], { model: runExecModel, temperature: 0.4, signal, provider: execProvider });
      if (revised && revised.trim()) {
        final = revised;
        callbacks.onToken && callbacks.onToken('', final);
      }
    } else {
      callbacks.onStepDone && callbacks.onStepDone(2, 'No issues found — approved as-is.');
    }

    return final;
  }

  return { run, runTeam };
})();
