/**
 * app.js — UI wiring for Coctus AI.
 *
 * This is a from-scratch rebuild of the front-end presentation layer only.
 * All the "engine" modules (models.js, memory.js, tools.js, files.js,
 * documents.js, agent.js, validate.js, workspace.js) are unchanged and
 * fully decoupled from the DOM — they talk to this file exclusively
 * through plain callbacks, so every feature they implement (agentic
 * planning, tools, personas, deep research, team mode, memory, exports,
 * project workspace, live preview, etc.) keeps working unchanged.
 *
 * What changed here vs. the previous build: there is no more a docked
 * "workspace panel". Thinking, the agent's plan/step trace, tool calls,
 * and any live code preview / project file browser now render INLINE in
 * the chat, directly under the message they belong to — the same way
 * Claude's own web UI shows its thinking and tool-use inline in the
 * conversation rather than in a separate window.
 */

(() => {
  const els = {
    app: document.getElementById('app'),
    backdrop: document.getElementById('backdrop'),
    sidebar: document.getElementById('sidebar'),
    closeSidebar: document.getElementById('closeSidebar'),
    toggleSidebar: document.getElementById('toggleSidebar'),
    newChatBtn: document.getElementById('newChatBtn'),
    authStatus: document.getElementById('authStatus'),
    authBtn: document.getElementById('authBtn'),
    modelSelect: document.getElementById('modelSelect'),
    agentToggle: document.getElementById('agentToggle'),
    researchToggle: document.getElementById('researchToggle'),
    completionToggle: document.getElementById('completionToggle'),
    toolsToggle: document.getElementById('toolsToggle'),
    sessionList: document.getElementById('sessionList'),
    memoryBtn: document.getElementById('memoryBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    sessionTitle: document.getElementById('sessionTitle'),
    topbarStatus: document.getElementById('topbarStatus'),
    modelPickerBtn: document.getElementById('modelPickerBtn'),
    modelPickerTag: document.getElementById('modelPickerTag'),
    settingsSummary: document.getElementById('settingsSummary'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsTopBtn: document.getElementById('settingsTopBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettings: document.getElementById('closeSettings'),
    themeToggle: document.getElementById('themeToggle'),
    chatScroll: document.getElementById('chatScroll'),
    emptyState: document.getElementById('emptyState'),
    suggestionGrid: document.getElementById('suggestionGrid'),
    messages: document.getElementById('messages'),
    typingIndicator: document.getElementById('typingIndicator'),
    composerForm: document.getElementById('composerForm'),
    composerInput: document.getElementById('composerInput'),
    composerQuick: document.getElementById('composerQuick'),
    sendBtn: document.getElementById('sendBtn'),
    stopBtn: document.getElementById('stopBtn'),
    fileAttach: document.getElementById('fileAttach'),
    attachPreview: document.getElementById('attachPreview'),
    memoryModal: document.getElementById('memoryModal'),
    closeMemory: document.getElementById('closeMemory'),
    memoryList: document.getElementById('memoryList'),
    memoryAddForm: document.getElementById('memoryAddForm'),
    memoryAddInput: document.getElementById('memoryAddInput'),
    exportModal: document.getElementById('exportModal'),
    closeExport: document.getElementById('closeExport'),
    personaRow: document.getElementById('personaRow'),
    criticSelect: document.getElementById('criticSelect'),
    sessionSearch: document.getElementById('sessionSearch'),
    micBtn: document.getElementById('micBtn'),
    paletteBtn: document.getElementById('paletteBtn'),
    paletteModal: document.getElementById('paletteModal'),
    paletteInput: document.getElementById('paletteInput'),
    paletteResults: document.getElementById('paletteResults'),
    profileName: document.getElementById('profileName'),
    profileRole: document.getElementById('profileRole'),
    profilePrefs: document.getElementById('profilePrefs'),
    profileSaveBtn: document.getElementById('profileSaveBtn'),
    backupExportBtn: document.getElementById('backupExportBtn'),
    backupImportInput: document.getElementById('backupImportInput'),
    deepResearchToggle: document.getElementById('deepResearchToggle'),
    teamToggle: document.getElementById('teamToggle'),
    thinkingToggle: document.getElementById('thinkingToggle'),
    providerRow: document.getElementById('providerRow'),
    openrouterKeyWarning: document.getElementById('openrouterKeyWarning'),
    openrouterKeyEntry: document.getElementById('openrouterKeyEntry'),
    openrouterKeyInput: document.getElementById('openrouterKeyInput'),
    openrouterKeySaveBtn: document.getElementById('openrouterKeySaveBtn'),
    hybridToggle: document.getElementById('hybridToggle'),
    execModelSelect: document.getElementById('execModelSelect'),
    openrouterKeyStatus: document.getElementById('openrouterKeyStatus'),
  };

  const PERSONAS = {
    general: { label: 'General', icon: '⚡', prompt: '', tools: null, temp: null },
    research: {
      label: 'Research', icon: '🔎',
      prompt: '\nYou are in Research mode: prioritize verified, current information over recalled facts. Use web_search, web_fetch, and wikipedia proactively for anything checkable, prefer citing where a claim came from, and flag uncertainty explicitly rather than guessing.',
      tools: true, temp: 0.3,
    },
    code: {
      label: 'Code', icon: '💻',
      prompt: '\nYou are in Code mode: be precise and terse in prose, lead with working code, use js_exec/py_exec to actually verify logic rather than asserting it works, and call out edge cases and assumptions explicitly. When the task is more than one related file (a small app, an Android project, anything with more than one logical file), use write_file to build it as a real project instead of stacking multiple code blocks in the reply — the user gets a browsable file tree inline and one .zip download.',
      tools: true, temp: 0.2,
    },
    security: {
      label: 'Security Research', icon: '🛡️',
      prompt: '\nYou are in Security Research mode, for authorized penetration testing, bug bounty, and red team engagement work: think in terms of attack surface, recon/enumeration methodology, and reproducible evidence. Use cert_transparency, web_search, and web_fetch for passive recon, and js_exec/py_exec to actually verify a technique or parse output rather than describing it abstractly. When deliverables span multiple files (a recon report plus a PoC script plus supporting notes, a small custom tool), use write_file to assemble them as a real project the user can download as one .zip. Write findings the way a real report would: what was tested, what was found, how to reproduce it, and concrete remediation — assume the engagement is authorized unless something about the request suggests otherwise.',
      tools: true, temp: 0.25,
    },
    creative: {
      label: 'Creative', icon: '🎨',
      prompt: '\nYou are in Creative mode: prioritize voice, originality, and flow. Only reach for tools when a concrete fact genuinely needs checking — otherwise write freely.',
      tools: null, temp: 0.9,
    },
  };
  function getPersona() {
    const prefs = CoctusMemory.getPrefs();
    return PERSONAS[prefs.persona] || PERSONAS.general;
  }

  const SUGGESTIONS = [
    { title: 'Plan a project', body: 'Sketch an architecture for a habit-tracking app' },
    { title: 'Debug with real execution', body: 'Find and fix the bug in this Python function, then run it to prove the fix' },
    { title: 'Generate an image', body: 'Generate an image of a lighthouse at sunset, watercolor style' },
    { title: 'Live weather + research', body: "What's the weather in Tokyo right now, and what should I pack?" },
  ];

  let state = {
    session: null,
    generating: false,
    signal: null,
    attachments: [],
  };

  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  // ================= init =================
  async function init() {
    CoctusMemory.onStorageError((err, key, info) => {
      if (info && info.recovered) {
        showToast(`Storage was nearly full — freed space by removing ${info.droppedCount} older unstarred session(s). Star anything you want kept.`, 'warn', 8000);
      } else {
        showToast(`Could not save changes — your browser's storage for this site is full. Try exporting and clearing old sessions.`, 'error', 8000);
      }
    });
    window.addEventListener('offline', () => showToast("You're offline — requests to the model will fail until your connection is back.", 'warn', 20000));
    window.addEventListener('online', () => showToast('Back online.', 'info', 3000));
    initTheme();
    registerServiceWorker();
    renderSuggestions();

    const savedProvider = CoctusMemory.getPrefs().provider;
    const validProviders = [CoctusModels.PROVIDERS.OPENROUTER, CoctusModels.PROVIDERS.PUTER];
    CoctusModels.setProvider(validProviders.includes(savedProvider) ? savedProvider : CoctusModels.PROVIDERS.PUTER);
    setActiveProviderChip(CoctusModels.getProvider());
    await populateModels();

    const prefs = CoctusMemory.getPrefs();
    els.agentToggle.checked = prefs.agentic !== false;
    els.researchToggle.checked = !!prefs.research;
    els.completionToggle.checked = prefs.runToCompletion !== false;
    els.toolsToggle.checked = prefs.tools !== false;
    els.deepResearchToggle.checked = !!prefs.deepResearch;
    els.teamToggle.checked = !!prefs.teamMode;
    els.thinkingToggle.checked = !!prefs.showThinking;
    els.hybridToggle.checked = !!prefs.hybridExec;
    els.execModelSelect.classList.toggle('hidden', !els.hybridToggle.checked);
    if (els.hybridToggle.checked) await populateExecModels(prefs.execModel);
    setActivePersonaChip(prefs.persona || 'general');

    const profile = CoctusMemory.getProfile();
    els.profileName.value = profile.name || '';
    els.profileRole.value = profile.role || '';
    els.profilePrefs.value = profile.preferences || '';

    const activeId = CoctusMemory.getActiveId();
    const existing = activeId && CoctusMemory.getSession(activeId);
    state.session = existing || CoctusMemory.createSession();
    if (!state.session.model) state.session.model = els.modelSelect.value;

    if (isMobile()) els.app.classList.add('sidebar-collapsed');

    renderSessionList();
    renderMessages();
    updateTopbar();
    renderQuickChips();
    autoResizeTextarea();
    bindEvents();
    refreshAuthStatus();
  }

  // ================= auth =================
  async function refreshAuthStatus() {
    if (!(window.puter && puter.auth)) {
      els.authStatus.textContent = 'Puter unavailable';
      els.authStatus.className = 'auth-status signed-out';
      return;
    }
    const signedIn = puter.auth.isSignedIn();
    if (signedIn) {
      els.authBtn.textContent = 'Sign out';
      els.authStatus.className = 'auth-status signed-in';
      try {
        const user = await puter.auth.getUser();
        els.authStatus.textContent = `@${user.username}`;
      } catch { els.authStatus.textContent = 'Signed in'; }
    } else {
      els.authBtn.textContent = 'Sign in';
      els.authStatus.textContent = 'Not signed in';
      els.authStatus.className = 'auth-status signed-out';
    }
  }
  async function handleAuthClick() {
    if (!(window.puter && puter.auth)) return;
    els.authBtn.disabled = true;
    try {
      if (puter.auth.isSignedIn()) puter.auth.signOut();
      else await puter.auth.signIn();
    } catch (err) {
      console.warn('Coctus: auth action failed or was cancelled.', err);
    } finally {
      els.authBtn.disabled = false;
      refreshAuthStatus();
    }
  }

  function refreshKeyPoolStatus() {
    if (CoctusModels.getProvider() !== CoctusModels.PROVIDERS.OPENROUTER) {
      els.openrouterKeyStatus.classList.add('hidden');
      return;
    }
    const status = CoctusModels.openRouterKeyPoolStatus();
    if (!status.length) { els.openrouterKeyStatus.classList.add('hidden'); return; }
    const cooling = status.filter(s => s.cooling);
    let text = status.length === 1 ? `1 OpenRouter key loaded.` : `${status.length} OpenRouter keys loaded — rotating automatically.`;
    if (cooling.length) text += ` ${cooling.length} cooling down, ${status.length - cooling.length} available.`;
    els.openrouterKeyStatus.textContent = text;
    els.openrouterKeyStatus.classList.remove('hidden');
  }

  // ================= models =================
  async function populateModels() {
    const prefs = CoctusMemory.getPrefs();
    const provider = CoctusModels.getProvider();
    const modelPrefKey = provider === CoctusModels.PROVIDERS.OPENROUTER ? 'openrouterModel' : 'model';

    els.openrouterKeyWarning.classList.toggle('hidden', provider !== CoctusModels.PROVIDERS.OPENROUTER || CoctusModels.openRouterKeyPresent());
    els.openrouterKeyEntry.classList.toggle('hidden', provider !== CoctusModels.PROVIDERS.OPENROUTER);
    refreshKeyPoolStatus();

    els.modelSelect.innerHTML = '';
    els.criticSelect.innerHTML = '<option value="">None — skip cross-model review</option>';

    let models = [];
    try { models = await CoctusModels.listModels(); }
    catch (err) {
      console.warn('Coctus: could not load model list', err);
      const opt = document.createElement('option');
      opt.textContent = provider === CoctusModels.PROVIDERS.OPENROUTER ? 'Could not reach OpenRouter — check your connection and key.js' : 'Could not load models';
      els.modelSelect.appendChild(opt);
      return;
    }
    if (!models.length) {
      const opt = document.createElement('option');
      opt.textContent = provider === CoctusModels.PROVIDERS.OPENROUTER ? 'No free models found right now on OpenRouter' : 'No models available';
      els.modelSelect.appendChild(opt);
      return;
    }

    const groups = {};
    models.forEach(m => { (groups[m.group] ||= []).push(m); });
    const buildInto = (select) => {
      Object.entries(groups).forEach(([group, list]) => {
        const og = document.createElement('optgroup');
        og.label = group;
        list.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id; opt.textContent = m.label;
          og.appendChild(opt);
        });
        select.appendChild(og);
      });
    };
    buildInto(els.modelSelect);
    if (prefs[modelPrefKey] && models.some(m => m.id === prefs[modelPrefKey])) els.modelSelect.value = prefs[modelPrefKey];
    buildInto(els.criticSelect);
    if (prefs.criticModel && models.some(m => m.id === prefs.criticModel)) els.criticSelect.value = prefs.criticModel;
    updateTopbar();
  }

  async function populateExecModels(preferredId) {
    els.execModelSelect.innerHTML = '<option>Loading models…</option>';
    els.execModelSelect.disabled = true;
    let models = [];
    try { models = await CoctusModels.listModels(); }
    catch {
      els.execModelSelect.innerHTML = '<option>Could not load models for execution</option>';
      return;
    }
    els.execModelSelect.innerHTML = '';
    if (!models.length) {
      els.execModelSelect.innerHTML = '<option>No models available</option>';
      return;
    }
    els.execModelSelect.disabled = false;
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.label;
      els.execModelSelect.appendChild(opt);
    });
    if (preferredId && models.some(m => m.id === preferredId)) els.execModelSelect.value = preferredId;
  }

  function renderSuggestions() {
    els.suggestionGrid.innerHTML = '';
    SUGGESTIONS.forEach(s => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.innerHTML = `<b>${escapeHtml(s.title)}</b>${escapeHtml(s.body)}`;
      card.addEventListener('click', () => {
        els.composerInput.value = s.body;
        autoResizeTextarea();
        els.composerInput.focus();
      });
      els.suggestionGrid.appendChild(card);
    });
  }

  function setActiveProviderChip(p) {
    if (!els.providerRow) return;
    els.providerRow.querySelectorAll('.persona-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.provider === p));
  }
  function setActivePersonaChip(id) {
    if (!els.personaRow) return;
    els.personaRow.querySelectorAll('.persona-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.persona === id));
    updateTopbar();
  }

  // ================= topbar / quick chips =================
  function updateTopbar() {
    const persona = getPersona();
    const modelOpt = els.modelSelect.selectedOptions[0];
    const modelLabel = modelOpt ? modelOpt.textContent : '';
    els.modelPickerTag.textContent = `${persona.icon} ${modelLabel || 'Select model'}`.trim();
    els.settingsSummary.textContent = modelLabel ? modelLabel.split(' ')[0] : '';
  }

  const QUICK_TOGGLES = [
    { key: 'tools', el: () => els.toolsToggle, label: '🔧 Tools' },
    { key: 'research', el: () => els.researchToggle, label: '🌐 Search' },
    { key: 'thinking', el: () => els.thinkingToggle, label: '🧠 Thinking' },
    { key: 'deepResearch', el: () => els.deepResearchToggle, label: '🔬 Deep Research', exclusiveWith: 'teamMode' },
    { key: 'teamMode', el: () => els.teamToggle, label: '👥 Team', exclusiveWith: 'deepResearch' },
  ];
  function renderQuickChips() {
    els.composerQuick.innerHTML = '';
    QUICK_TOGGLES.forEach(t => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-chip' + (t.el().checked ? ' active' : '');
      chip.textContent = t.label;
      chip.addEventListener('click', () => {
        t.el().checked = !t.el().checked;
        if (t.el().checked && t.exclusiveWith) {
          const other = QUICK_TOGGLES.find(x => x.key === t.exclusiveWith);
          if (other) other.el().checked = false;
        }
        t.el().dispatchEvent(new Event('change'));
        renderQuickChips();
      });
      els.composerQuick.appendChild(chip);
    });
  }

  // ================= drawers =================
  function updateBackdrop() {
    els.backdrop.classList.toggle('hidden', !(isMobile() && !els.app.classList.contains('sidebar-collapsed')));
  }
  function closeSidebarDrawer() { if (isMobile()) els.app.classList.add('sidebar-collapsed'); updateBackdrop(); }
  function toggleSidebarDrawer() { els.app.classList.toggle('sidebar-collapsed'); updateBackdrop(); }

  // ================= sessions =================
  function renderSessionList() {
    const query = els.sessionSearch ? els.sessionSearch.value : '';
    const sessions = query ? CoctusMemory.searchSessions(query) : CoctusMemory.getSessions();
    els.sessionList.innerHTML = '';
    if (query && !sessions.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = `No chats match "${query}".`;
      els.sessionList.appendChild(empty);
      return;
    }
    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === state.session.id ? ' active' : '');
      item.innerHTML = `<span class="star${s.starred ? ' starred' : ''}" title="${s.starred ? 'Unstar' : 'Star'}">${s.starred ? '★' : '☆'}</span><span class="session-item-title">${escapeHtml(s.title)}</span><span class="del" title="Delete">✕</span>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('del') || e.target.classList.contains('star')) return;
        switchSession(s.id);
        if (isMobile()) closeSidebarDrawer();
      });
      item.querySelector('.star').addEventListener('click', (e) => { e.stopPropagation(); CoctusMemory.toggleStarSession(s.id); renderSessionList(); });
      item.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        CoctusMemory.deleteSession(s.id);
        if (s.id === state.session.id) {
          const remaining = CoctusMemory.getSessions();
          state.session = remaining[0] || CoctusMemory.createSession();
        }
        renderSessionList();
        renderMessages();
      });
      els.sessionList.appendChild(item);
    });
  }

  function switchSession(id) {
    const s = CoctusMemory.getSession(id);
    if (!s) return;
    state.session = s;
    CoctusMemory.setActiveId(id);
    if (s.model) els.modelSelect.value = s.model;
    renderSessionList();
    renderMessages();
    CoctusWorkspace.clear();
    updateTopbar();
  }

  function newSession() {
    state.session = CoctusMemory.createSession();
    state.session.model = els.modelSelect.value;
    CoctusMemory.saveSession(state.session);
    renderSessionList();
    renderMessages();
    CoctusWorkspace.clear();
    if (isMobile()) closeSidebarDrawer();
    els.composerInput.focus();
  }

  // ================= messages =================
  function renderMessages() {
    els.sessionTitle.textContent = state.session.title;
    els.messages.innerHTML = '';
    if (!state.session.messages.length) {
      els.emptyState.classList.remove('hidden');
    } else {
      els.emptyState.classList.add('hidden');
      state.session.messages.forEach(m => {
        const el = appendMessageEl(m.role, m.content, false, null, m.images);
        if (m.thinking) setThinking(el, m.thinking);
      });
    }
    scrollToBottom();
  }

  function appendMessageEl(role, content, animate = true, badge = null, images = null) {
    els.emptyState.classList.add('hidden');
    const wrap = document.createElement('div');
    wrap.className = 'msg';
    wrap.dataset.role = role === 'user' ? 'user' : 'assistant';
    const body = document.createElement('div');
    body.className = 'msg-body';
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = role === 'user' ? 'You' : 'Coctus AI';
    if (badge) {
      const b = document.createElement('span');
      b.className = 'meta-badge';
      b.textContent = badge;
      meta.appendChild(b);
    }
    body.appendChild(meta);

    if (images && images.length) {
      const thumbs = document.createElement('div');
      thumbs.className = 'msg-images';
      images.forEach(img => {
        const el = document.createElement('img');
        el.src = img.dataUrl; el.alt = img.name; el.title = img.name;
        el.addEventListener('click', () => window.open(img.dataUrl, '_blank'));
        thumbs.appendChild(el);
      });
      body.appendChild(thumbs);
    }

    const content_ = document.createElement('div');
    content_.className = 'msg-content';
    content_.innerHTML = renderMarkdown(content);
    body.appendChild(content_);

    if (role !== 'user') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-action'; copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content_.dataset.raw || content).then(() => {
          copyBtn.textContent = 'Copied'; setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        }).catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
      });
      actions.appendChild(copyBtn);

      if (CoctusModels.ttsAvailable()) {
        const listenBtn = document.createElement('button');
        listenBtn.className = 'msg-action'; listenBtn.textContent = '🔊 Listen';
        let audioEl = null;
        listenBtn.addEventListener('click', async () => {
          if (audioEl) { audioEl.paused ? audioEl.play() : audioEl.pause(); return; }
          listenBtn.textContent = '⏳ Loading…'; listenBtn.disabled = true;
          try {
            audioEl = await CoctusModels.speak(content_.dataset.raw || content);
            listenBtn.disabled = false; listenBtn.textContent = '⏸ Pause';
            audioEl.addEventListener('ended', () => { listenBtn.textContent = '🔊 Listen'; audioEl = null; });
            audioEl.addEventListener('pause', () => { if (audioEl) listenBtn.textContent = '▶ Resume'; });
            audioEl.addEventListener('play', () => { listenBtn.textContent = '⏸ Pause'; });
            audioEl.play();
          } catch (err) {
            listenBtn.disabled = false; listenBtn.textContent = '🔊 Listen';
            console.warn('Coctus: TTS failed', err);
          }
        });
        actions.appendChild(listenBtn);
      }

      const title = () => (state.session.title || 'coctus-response');
      const mdBtn = document.createElement('button');
      mdBtn.className = 'msg-action'; mdBtn.textContent = 'Download .md';
      mdBtn.addEventListener('click', () => CoctusDocuments.downloadMessageAsMarkdown(content_.dataset.raw || content, title()));
      actions.appendChild(mdBtn);

      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'msg-action'; pdfBtn.textContent = 'Download .pdf';
      pdfBtn.addEventListener('click', () => CoctusDocuments.downloadMessageAsPdf(content_.dataset.raw || content, title()));
      actions.appendChild(pdfBtn);

      const docBtn = document.createElement('button');
      docBtn.className = 'msg-action'; docBtn.textContent = 'Download .docx';
      docBtn.addEventListener('click', () => CoctusDocuments.downloadMessageAsDocx(content_.innerHTML, title()));
      actions.appendChild(docBtn);

      body.appendChild(actions);
    }
    content_.dataset.raw = content;

    wrap.appendChild(body);
    els.messages.appendChild(wrap);
    decorateCodeBlocks(content_, body);
    if (animate) scrollToBottom();
    return content_;
  }

  function renderMarkdown(text) {
    try {
      marked.setOptions({ breaks: true, gfm: true });
      return DOMPurify.sanitize(marked.parse(text || ''));
    } catch { return escapeHtml(text); }
  }

  function splitThinking(text) {
    if (!text || !text.includes('<thinking>')) return { thinking: '', answer: text || '', tagged: false };
    const thinkMatch = text.match(/<thinking>([\s\S]*?)(<\/thinking>|$)/);
    const answerMatch = text.match(/<answer>([\s\S]*?)(<\/answer>|$)/);
    return { thinking: thinkMatch ? thinkMatch[1].trim() : '', answer: answerMatch ? answerMatch[1] : '', tagged: true };
  }

  /** Lazily creates the collapsible "Thought process" block above a message's content — Claude-style visible reasoning. */
  function setThinking(contentEl, text) {
    if (!contentEl || !text) return;
    if (!contentEl._thinkingEl) {
      const details = document.createElement('details');
      details.className = 'msg-thinking';
      const summary = document.createElement('summary');
      summary.textContent = 'Thought process';
      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'msg-thinking-body';
      details.appendChild(summary); details.appendChild(bodyDiv);
      contentEl.parentElement.insertBefore(details, contentEl);
      contentEl._thinkingEl = bodyDiv;
    }
    contentEl._thinkingEl.innerHTML = renderMarkdown(text);
  }

  // ================= inline agent trace (replaces the old docked "Agent trace" panel) =================
  // Builds a collapsible card, inserted above the message content, that
  // shows the plan, step-by-step progress, tool calls, and any project
  // files the agent writes — live, inline, in the chat itself.
  function createTrace(bodyEl, contentEl) {
    const card = document.createElement('div');
    card.className = 'trace-card open';
    const head = document.createElement('div');
    head.className = 'trace-head';
    head.innerHTML = `<span class="trace-phase-dot"></span><span class="trace-label">Working…</span><span class="trace-time"></span><span class="chev">▸</span>`;
    const body = document.createElement('div');
    body.className = 'trace-body';
    card.appendChild(head); card.appendChild(body);
    head.addEventListener('click', () => card.classList.toggle('open'));
    bodyEl.insertBefore(card, contentEl);
    contentEl._traceCard = { el: card };

    const startedAt = Date.now();
    let planEl = null;
    let pendingToolRow = null;
    let projectSection = null;

    function setLabel(text) { head.querySelector('.trace-label').textContent = text; }

    function addRow(text, cls) {
      const row = document.createElement('div');
      row.className = 'trace-row' + (cls ? ` ${cls}` : '');
      row.textContent = text;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
      return row;
    }

    function showPlan(plan) {
      if (!plan) return;
      if (!planEl) { planEl = document.createElement('div'); body.insertBefore(planEl, body.firstChild); }
      planEl.innerHTML = `<div class="trace-goal">${escapeHtml(plan.goal || '')}</div>`;
      (plan.steps || []).forEach((step, i) => {
        const el = document.createElement('div');
        el.className = 'trace-step';
        el.id = `${card.dataset.id}-step-${i}`;
        el.dataset.step = i;
        el.innerHTML = `<span class="trace-step-marker"></span><div class="trace-step-body"><b>${escapeHtml(step.title)}</b><span class="trace-step-detail">${escapeHtml(step.detail || '')}</span><div class="trace-step-note"></div></div>`;
        planEl.appendChild(el);
      });
    }
    function markStep(i, status) {
      const el = planEl && planEl.querySelector(`.trace-step[data-step="${i}"]`);
      if (!el) return;
      el.classList.remove('active', 'done');
      if (status) el.classList.add(status);
    }
    function updateStepNote(i, full) {
      const el = planEl && planEl.querySelector(`.trace-step[data-step="${i}"] .trace-step-note`);
      if (!el) return;
      el.textContent = full;
      body.scrollTop = body.scrollHeight;
    }
    const TOOL_ICONS = { web_fetch: '🌐', web_search: '🔎', calculator: '🧮', js_exec: '⚙️', py_exec: '🐍', wikipedia: '📖', weather: '⛅', image_gen: '🖼️', write_file: '📝', read_file: '📄', list_files: '📁' };
    function toolCall(call, result) {
      const icon = TOOL_ICONS[call.tool] || '🔧';
      const argStr = call.args ? Object.entries(call.args).map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`).join(', ') : '';
      if (!result) {
        pendingToolRow = addRow(`${icon} Calling ${call.tool}(${argStr})…`, 'tool-call tool-pending');
      } else {
        const row = pendingToolRow || addRow('', 'tool-call');
        row.className = 'trace-row tool-call ' + (result.ok ? 'tool-ok' : 'tool-err');
        row.textContent = result.ok
          ? `${icon} ${call.tool}(${argStr}) → ${String(result.result || '').slice(0, 140)}`
          : `${icon} ${call.tool}(${argStr}) failed: ${result.error || ''}`;
        pendingToolRow = null;
        if (result.ok && (call.tool === 'write_file' || call.tool === 'read_file')) refreshProject();
      }
    }
    function refreshProject() {
      const files = CoctusWorkspace.listFiles();
      if (!files.length) return;
      if (!projectSection) {
        projectSection = document.createElement('div');
        projectSection.className = 'project-card';
        body.appendChild(projectSection);
      }
      projectSection.innerHTML = `<div class="project-card-title"><span>Project — ${files.length} file${files.length === 1 ? '' : 's'}</span></div>`;
      const list = document.createElement('div');
      list.className = 'project-file-list';
      files.forEach(f => {
        const row = document.createElement('div');
        row.className = 'project-file-row';
        row.innerHTML = `<span class="path">${escapeHtml(f.path)}</span><span class="size">${formatBytes(f.size)}</span>`;
        row.addEventListener('click', () => showProjectFileArtifact(bodyEl, contentEl, f.path));
        list.appendChild(row);
      });
      projectSection.appendChild(list);
      const actions = document.createElement('div');
      actions.className = 'project-actions';
      const zipBtn = document.createElement('button');
      zipBtn.className = 'btn-ghost small'; zipBtn.textContent = '⬇ Download project (.zip)';
      zipBtn.addEventListener('click', async () => {
        try {
          const blob = await CoctusWorkspace.exportZip();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${safeName(state.session.title)}-project.zip`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) { showToast('Could not build the zip: ' + err.message, 'error'); }
      });
      actions.appendChild(zipBtn);
      projectSection.appendChild(actions);
      body.scrollTop = body.scrollHeight;
    }
    function finish() {
      const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      head.querySelector('.trace-phase-dot').classList.add('done');
      head.querySelector('.trace-time').textContent = `${secs}s`;
      setLabel('Worked through the request');
      card.classList.remove('open');
    }
    return { setLabel, addRow, showPlan, markStep, updateStepNote, toolCall, refreshProject, finish, hasContent: () => body.children.length > 0, remove: () => card.remove() };
  }

  function decorateCodeBlocks(container, body) {
    const blocksForZip = [];
    container.querySelectorAll('pre code').forEach((block) => {
      try { hljs.highlightElement(block); } catch {}
      const pre = block.parentElement;
      if (pre.parentElement.classList.contains('code-block-wrap')) return;

      const langMatch = [...block.classList].find(c => c.startsWith('language-'));
      const lang = langMatch ? langMatch.replace('language-', '') : '';
      const code = block.textContent;
      blocksForZip.push({ lang, code });

      const wrap = document.createElement('div');
      wrap.className = 'code-block-wrap';
      pre.parentElement.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      if (lang) {
        const langTag = document.createElement('span'); langTag.className = 'code-block-lang'; langTag.textContent = lang;
        wrap.appendChild(langTag);
      }

      const toolbar = document.createElement('div');
      toolbar.className = 'code-block-toolbar';
      let artifactEl = null;

      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        artifactEl = toggleInlineArtifact(wrap, artifactEl, lang, code, false, openBtn);
      });
      toolbar.appendChild(openBtn);

      if (isPreviewable(lang)) {
        const previewBtn = document.createElement('button');
        previewBtn.textContent = '▶ Preview'; previewBtn.className = 'preview-trigger';
        previewBtn.addEventListener('click', () => {
          artifactEl = toggleInlineArtifact(wrap, artifactEl, lang, code, true, previewBtn);
        });
        toolbar.appendChild(previewBtn);
      }

      const dlBtn = document.createElement('button');
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', () => CoctusDocuments.downloadCodeBlock(code, lang));
      toolbar.appendChild(dlBtn);

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.textContent = 'Copied'; setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        }).catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
      });
      toolbar.appendChild(copyBtn);

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Project';
      addBtn.title = 'Add this file to the in-memory project workspace';
      addBtn.addEventListener('click', () => {
        const suggested = suggestFilename(lang, code);
        const path = prompt('Add to project as:', suggested);
        if (!path) return;
        const existed = CoctusWorkspace.readFile(path) !== null;
        CoctusWorkspace.writeFile(path, code);
        showToast(existed ? `Overwrote "${path}" in the project.` : `Added "${path}" to the project.`);
        refreshOpenProjectCards();
      });
      toolbar.appendChild(addBtn);

      wrap.appendChild(toolbar);
    });

    if (body && blocksForZip.length >= 2) {
      const actions = body.querySelector('.msg-actions');
      if (actions && !actions.querySelector('.zip-action')) {
        const zipBtn = document.createElement('button');
        zipBtn.className = 'msg-action zip-action';
        zipBtn.textContent = `Download all (${blocksForZip.length}) as .zip`;
        zipBtn.addEventListener('click', () => CoctusDocuments.downloadBlocksAsZip(blocksForZip, state.session.title || 'coctus-files'));
        actions.appendChild(zipBtn);
      }
      const COMBINABLE = new Set(['html', 'htm', 'css', 'js', 'javascript']);
      const combo = blocksForZip.filter(b => COMBINABLE.has(String(b.lang || '').toLowerCase()));
      if (actions && combo.length >= 2 && !actions.querySelector('.combo-preview-action')) {
        const comboBtn = document.createElement('button');
        comboBtn.className = 'msg-action combo-preview-action';
        comboBtn.textContent = `▶ Preview as one app (${combo.length} files)`;
        comboBtn.addEventListener('click', () => {
          const artifactEl = buildArtifactCard({ combo: true, blocks: combo }, `${combo.length} files · combined app`);
          body.appendChild(artifactEl);
          artifactEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        actions.appendChild(comboBtn);
      }
    }
  }

  function refreshOpenProjectCards() {
    document.querySelectorAll('.project-card').forEach(() => {}); // project cards self-update on next tool call/render; nothing to force here
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { els.chatScroll.scrollTop = els.chatScroll.scrollHeight; });
  }

  // ---------------- filenames / language helpers ----------------
  function suggestFilename(lang, code) {
    const firstLine = (code || '').split('\n')[0] || '';
    const hinted = firstLine.match(/(?:file|filename|path)\s*[:=]\s*["'`]?([\w./-]+\.\w+)/i);
    if (hinted) return hinted[1];
    return `file.${CoctusDocuments.extFor(lang)}`;
  }
  function guessLangFromPath(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = { js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', html: 'html', htm: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown', sh: 'bash', java: 'java', kt: 'kotlin', gradle: 'groovy', xml: 'xml', yml: 'yaml', yaml: 'yaml', c: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql', swift: 'swift' };
    return map[ext] || 'plaintext';
  }

  // ================= inline artifact (Open / Preview) — renders directly under the code block, no side panel =================
  const PREVIEWABLE_LANGS = new Set(['html', 'htm', 'svg', 'css', 'js', 'javascript', 'jsx', 'tsx', 'ts', 'typescript']);
  function isPreviewable(lang) { return PREVIEWABLE_LANGS.has(String(lang || '').toLowerCase()); }

  function buildPreviewDoc(lang, code) {
    const l = String(lang || '').toLowerCase();
    if (l === 'html' || l === 'htm') {
      if (/<html[\s>]/i.test(code)) return code;
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#111;background:#fff;}</style></head><body>${code}</body></html>`;
    }
    if (l === 'svg') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#f2f2f5 0% 25%, #fff 0% 50%) 50% / 24px 24px;}svg{max-width:92%;max-height:92%;}</style></head><body>${code}</body></html>`;
    }
    if (l === 'css') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${code}</style></head><body style="font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111;background:#fff;"><p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">CSS preview — applied to sample elements below</p><h1>Heading one</h1><h2>Heading two</h2><p>A paragraph of body text with a <a href="#">link</a> inside it.</p><button>Button</button> <button disabled>Disabled</button><div class="card" style="margin-top:12px;"><p>A generic <code>.card</code> div, in case your CSS targets one.</p></div><ul><li>List item one</li><li>List item two</li></ul></body></html>`;
    }
    if (l === 'jsx' || l === 'tsx' || (l === 'ts' && /<[A-Za-z]/.test(code))) {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;background:#fff;}#coctus-root:empty::after{content:'(component rendered nothing)';color:#999;font-size:13px;}.coctus-err{white-space:pre-wrap;font-family:monospace;font-size:12.5px;color:#b3261e;background:#fdecea;border:1px solid #f2b8b5;border-radius:8px;padding:12px;}</style><script src="https://unpkg.com/react@18/umd/react.development.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script></head><body><div id="coctus-root"></div><script type="text/babel" data-presets="react,typescript" data-type="module">
        try {
          ${code}
          const __candidates = [typeof App !== 'undefined' ? App : undefined, typeof exports !== 'undefined' ? exports.default : undefined, typeof module !== 'undefined' && module.exports ? module.exports.default || module.exports : undefined];
          const __Comp = __candidates.find(c => typeof c === 'function');
          const root = ReactDOM.createRoot(document.getElementById('coctus-root'));
          if (__Comp) root.render(React.createElement(__Comp));
          else root.render(React.createElement('div', {className:'coctus-err'}, 'No component found to render. Define a function/const named "App" or use "export default".'));
        } catch (err) {
          document.getElementById('coctus-root').innerHTML = '<div class="coctus-err">' + (err && err.message || String(err)).replace(/</g,'&lt;') + '</div>';
        }
        </script></body></html>`;
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;background:#fff;}#coctus-console{font-family:monospace;font-size:12.5px;white-space:pre-wrap;line-height:1.6;}.coctus-log{color:#111;} .coctus-error{color:#b3261e;} .coctus-warn{color:#a15c00;}#coctus-tag{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;}</style>${l.startsWith('ts') ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>' : ''}</head><body><div id="coctus-tag">console output</div><div id="coctus-console"></div><script>
        const out = document.getElementById('coctus-console');
        function line(cls, args){ const d=document.createElement('div'); d.className=cls; d.textContent = args.map(a=>{try{return typeof a==='string'?a:JSON.stringify(a);}catch(e){return String(a);}}).join(' '); out.appendChild(d); }
        console.log = (...a) => line('coctus-log', a);
        console.warn = (...a) => line('coctus-warn', a);
        console.error = (...a) => line('coctus-error', a);
        window.onerror = (msg) => { line('coctus-error', ['Uncaught: ' + msg]); };
      </script><script${l.startsWith('ts') ? ' type="text/babel" data-presets="typescript"' : ''}>${code}</script></body></html>`;
  }

  function buildCombinedPreviewDoc(blocks) {
    const htmlBlock = blocks.find(b => ['html', 'htm'].includes(String(b.lang || '').toLowerCase()));
    const css = blocks.filter(b => String(b.lang || '').toLowerCase() === 'css').map(b => b.code).join('\n');
    const js = blocks.filter(b => ['js', 'javascript'].includes(String(b.lang || '').toLowerCase())).map(b => b.code).join('\n');
    let base = htmlBlock ? htmlBlock.code : '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>';
    if (!/<html[\s>]/i.test(base)) base = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#111;background:#fff;}</style></head><body>${base}</body></html>`;
    if (css) base = /<\/head>/i.test(base) ? base.replace(/<\/head>/i, `<style>${css}</style></head>`) : base.replace(/<body[^>]*>/i, (m) => `${m}<style>${css}</style>`);
    if (js) base = /<\/body>/i.test(base) ? base.replace(/<\/body>/i, `<script>${js}</script></body>`) : base + `<script>${js}</script>`;
    return base;
  }

  /** Toggles an inline artifact card directly under a code block (open/close on repeated click). */
  function toggleInlineArtifact(wrap, existingEl, lang, code, startInPreview, triggerBtn) {
    if (existingEl && existingEl.isConnected) {
      existingEl.remove();
      if (triggerBtn) triggerBtn.classList.remove('active-toggle');
      return null;
    }
    if (triggerBtn) triggerBtn.classList.add('active-toggle');
    const card = buildArtifactCard({ lang, code }, lang || 'text', startInPreview);
    wrap.parentElement.insertBefore(card, wrap.nextSibling);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return card;
  }

  /** spec: { lang, code } for a single snippet, or { combo:true, blocks } for a combined preview. */
  function buildArtifactCard(spec, tag, startInPreview) {
    const card = document.createElement('div');
    card.className = 'artifact-card';
    const toolbar = document.createElement('div'); toolbar.className = 'artifact-toolbar';
    const tagEl = document.createElement('span'); tagEl.className = 'tag'; tagEl.textContent = tag;
    toolbar.appendChild(tagEl);
    const bodyWrap = document.createElement('div'); bodyWrap.className = 'artifact-body';
    card.appendChild(toolbar); card.appendChild(bodyWrap);

    const doc = () => spec.combo ? buildCombinedPreviewDoc(spec.blocks) : buildPreviewDoc(spec.lang, currentCode());
    let editedCode = spec.combo ? null : spec.code;
    function currentCode() { return editedCode !== null ? editedCode : spec.code; }

    let mode = startInPreview && !spec.combo ? 'preview' : (spec.combo ? 'preview' : 'code');

    function renderCode() {
      bodyWrap.innerHTML = '';
      const pre = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.className = spec.lang ? `language-${spec.lang}` : '';
      codeEl.textContent = currentCode();
      pre.appendChild(codeEl);
      bodyWrap.appendChild(pre);
      try { hljs.highlightElement(codeEl); } catch {}
    }
    function renderEdit() {
      bodyWrap.innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'artifact-edit'; ta.spellcheck = false; ta.value = currentCode();
      ta.addEventListener('input', () => { editedCode = ta.value; });
      bodyWrap.appendChild(ta);
    }
    function renderPreview() {
      bodyWrap.innerHTML = '';
      const frameWrap = document.createElement('div'); frameWrap.className = 'artifact-frame-wrap';
      const frame = document.createElement('iframe');
      frame.className = 'artifact-frame';
      frame.sandbox = 'allow-scripts allow-modals allow-forms allow-popups';
      frame.title = 'Live artifact preview';
      frame.srcdoc = doc();
      frameWrap.appendChild(frame);
      bodyWrap.appendChild(frameWrap);
    }
    function render() {
      if (mode === 'code') renderCode();
      else if (mode === 'edit') renderEdit();
      else renderPreview();
      renderToolbar();
    }
    function renderToolbar() {
      toolbar.innerHTML = ''; toolbar.appendChild(tagEl);
      const codeBtn = document.createElement('button'); codeBtn.textContent = 'Code';
      if (mode === 'code') codeBtn.classList.add('primary');
      codeBtn.addEventListener('click', () => { mode = 'code'; render(); });
      toolbar.appendChild(codeBtn);

      if (isPreviewable(spec.lang) || spec.combo) {
        const pvBtn = document.createElement('button'); pvBtn.textContent = '▶ Preview';
        if (mode === 'preview') pvBtn.classList.add('primary');
        pvBtn.addEventListener('click', () => { mode = 'preview'; render(); });
        toolbar.appendChild(pvBtn);
      }
      if (!spec.combo) {
        const editBtn = document.createElement('button'); editBtn.textContent = '✎ Edit';
        if (mode === 'edit') editBtn.classList.add('primary');
        editBtn.addEventListener('click', () => { mode = 'edit'; render(); });
        toolbar.appendChild(editBtn);
      }
      if (mode === 'preview') {
        const refreshBtn = document.createElement('button'); refreshBtn.textContent = 'Refresh';
        refreshBtn.addEventListener('click', () => render());
        toolbar.appendChild(refreshBtn);
        const popBtn = document.createElement('button'); popBtn.textContent = 'Open in new tab';
        popBtn.addEventListener('click', () => {
          const blob = new Blob([doc()], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        });
        toolbar.appendChild(popBtn);
      }
      if (!spec.combo) {
        const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => navigator.clipboard.writeText(currentCode()).then(() => { copyBtn.textContent = 'Copied'; setTimeout(() => copyBtn.textContent = 'Copy', 1000); }));
        toolbar.appendChild(copyBtn);
        const dlBtn = document.createElement('button'); dlBtn.textContent = 'Download';
        dlBtn.addEventListener('click', () => CoctusDocuments.downloadCodeBlock(currentCode(), spec.lang));
        toolbar.appendChild(dlBtn);
        if (mode === 'edit') {
          const askBtn = document.createElement('button'); askBtn.textContent = 'Ask Coctus to continue from this'; askBtn.className = 'primary';
          askBtn.addEventListener('click', () => {
            els.composerInput.value = `Continue from this edited version of the code:\n\n\`\`\`${spec.lang || ''}\n${currentCode()}\n\`\`\`\n\n`;
            autoResizeTextarea();
            els.composerInput.focus();
            card.scrollIntoView({ behavior: 'smooth' });
          });
          toolbar.appendChild(askBtn);
        }
      }
      const closeBtn = document.createElement('button'); closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => card.remove());
      toolbar.appendChild(closeBtn);
    }
    render();
    return card;
  }

  function showProjectFileArtifact(bodyEl, contentEl, path) {
    const content = CoctusWorkspace.readFile(path);
    if (content === null) return;
    const lang = guessLangFromPath(path);
    const card = buildArtifactCard({ lang, code: content }, path);
    bodyEl.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ================= sending =================
  const PHASE_LABELS = { discuss: 'Discussing', plan: 'Planning', execute: 'Executing', review: 'Reviewing' };

  async function handleSend(e) {
    e.preventDefault();
    if (state.generating || state.attachments.some(a => a.kind === 'loading')) return;
    const text = els.composerInput.value.trim();
    const pendingAttachments = state.attachments.filter(a => a.kind !== 'loading');
    if (!text && !pendingAttachments.length) return;
    if (navigator.onLine === false) { showToast("You're offline — reconnect and try again.", 'error', 6000); return; }

    let fullUserText = text;
    const imageBlocks = []; const displayImages = [];
    for (const att of pendingAttachments) {
      if (att.kind === 'image') { imageBlocks.push({ type: 'image_url', image_url: { url: att.dataUrl } }); displayImages.push({ name: att.name, dataUrl: att.dataUrl }); }
      else if (att.kind === 'text') fullUserText += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${att.text}\n\`\`\``;
      else fullUserText += `\n\n[Attached file: ${att.name} (${att.mime || 'unknown type'}, ${formatBytes(att.size)}) — binary file, contents not extracted]`;
    }
    if (!text && pendingAttachments.length) fullUserText = fullUserText.trim() || 'Please look at the attached file(s).';
    const userContent = imageBlocks.length ? [{ type: 'text', text: fullUserText }, ...imageBlocks] : fullUserText;

    CoctusMemory.autoExtract(text);
    if (state.session.messages.length === 0) {
      state.session.title = (text || pendingAttachments[0]?.name || 'Untitled').slice(0, 48) + ((text || '').length > 48 ? '…' : '');
    }
    const userMsg = { role: 'user', content: fullUserText };
    if (displayImages.length) userMsg.images = displayImages;
    state.session.messages.push(userMsg);
    state.session.model = els.modelSelect.value;
    CoctusMemory.saveSession(state.session);
    renderSessionList();
    els.sessionTitle.textContent = state.session.title;

    appendMessageEl('user', fullUserText, true, null, displayImages);
    els.composerInput.value = '';
    clearAttachments();
    autoResizeTextarea();
    setGenerating(true);

    const model = els.modelSelect.value;
    const useHybrid = els.hybridToggle.checked && els.execModelSelect.value && !els.execModelSelect.disabled;
    const execModel = useHybrid ? els.execModelSelect.value : null;
    const execProvider = null;
    const agentic = els.agentToggle.checked;
    const research = els.researchToggle.checked;
    const runToCompletion = els.completionToggle.checked;
    const tools = els.toolsToggle.checked;
    const deepResearch = els.deepResearchToggle.checked;
    const teamMode = els.teamToggle.checked;
    const showThinking = els.thinkingToggle.checked;
    const liveSearch = research && CoctusModels.supportsWebSearch(model);
    const persona = getPersona();
    const criticModel = els.criticSelect.value || null;
    const provider = CoctusModels.getProvider();
    const modelPrefKey = provider === CoctusModels.PROVIDERS.OPENROUTER ? 'openrouterModel' : 'model';
    CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), [modelPrefKey]: model, agentic, research, runToCompletion, tools, criticModel, deepResearch, teamMode, showThinking });

    setStatus('Recalling context…');
    const history = await CoctusMemory.getConversationContext(state.session, model, CoctusModels.chat);
    const facts = CoctusMemory.factsAsSystemContext();
    const profileCtx = CoctusMemory.profileAsSystemContext();
    const recalled = CoctusMemory.recallContext(text, state.session.id);
    let systemPreamble = `You are Coctus AI, an agentic assistant embedded in a single-page web app. You are direct, precise, and helpful across coding, research, writing, and general reasoning. Format responses in clean markdown; use fenced code blocks with a language tag for any code. When a task has multiple parts (e.g. several files, a multi-section document), write all of them out in full — never summarize or promise to add the rest "later".`;
    systemPreamble += persona.prompt;
    if (liveSearch) systemPreamble += `\nWeb search is available to you for this turn — use it for anything time-sensitive or where current facts matter, and note when a claim comes from a live search result.`;
    else if (research) systemPreamble += `\nThe user asked for web-aware answers, but the selected model doesn't have live search wired up here — be explicit about your knowledge cutoff and flag anything that may have changed since, rather than asserting current facts with false confidence.`;
    if (profileCtx) systemPreamble += `\n\n${profileCtx}`;
    if (facts) systemPreamble += `\n\n${facts}`;
    if (recalled) systemPreamble += `\n\n${recalled}`;

    const badge = teamMode ? '👥 team' : deepResearch ? '🔬 deep research' : (liveSearch ? '🔎 web search' : null);

    els.typingIndicator.classList.remove('hidden');
    setStatus(teamMode ? 'Assembling team…' : agentic ? 'Planning…' : 'Thinking…');
    scrollToBottom();

    let contentEl = null; let bodyEl = null; let trace = null; let streamed = '';
    state.signal = { cancelled: false };

    function ensureMessage() {
      if (contentEl) return;
      els.typingIndicator.classList.add('hidden');
      contentEl = appendMessageEl('assistant', '', true, badge);
      bodyEl = contentEl.parentElement;
      trace = createTrace(bodyEl, contentEl);
      setStatus('Writing…');
    }

    function paintStream(full) {
      streamed = full;
      const parsed = splitThinking(full);
      if (parsed.tagged) {
        if (parsed.thinking) setThinking(contentEl, parsed.thinking);
        contentEl.innerHTML = renderMarkdown(parsed.answer);
      } else {
        contentEl.innerHTML = renderMarkdown(full);
      }
      decorateCodeBlocks(contentEl, bodyEl);
      scrollToBottom();
    }

    const callbacks = {
      onPhase: (phase, detail) => {
        ensureMessage();
        const label = PHASE_LABELS[phase] || phase;
        if (phase === 'execute' && detail && detail.provider) { trace.setLabel(`${label} (local: ${detail.model})…`); setStatus(`${label}…`); }
        else if (phase === 'discuss' && typeof detail === 'string' && detail) { trace.addRow(detail, 'note-row'); trace.setLabel(`${label}…`); setStatus(`${label}…`); }
        else { trace.setLabel(`${label}…`); setStatus(`${label}…`); }
      },
      onPlan: (plan) => { ensureMessage(); trace.showPlan(plan); trace.setLabel(plan ? 'Working through plan…' : 'Writing…'); setStatus(plan ? 'Working through plan…' : 'Writing…'); },
      onStepStart: (i) => { ensureMessage(); trace.markStep(i, 'active'); },
      onStepDone: (i) => { ensureMessage(); trace.markStep(i, 'done'); },
      onStepToken: (i, chunk, full) => { ensureMessage(); trace.updateStepNote(i, full); },
      onRound: (n, reason) => { ensureMessage(); trace.addRow(`Continuing — round ${n}${reason ? ': ' + reason : ''}`, 'round-row'); setStatus(`Continuing (round ${n})…`); },
      onNote: (note) => { ensureMessage(); trace.addRow(note, 'note-row'); setStatus('Verifying…'); },
      onToolCall: (call, result) => {
        ensureMessage(); trace.toolCall(call, result);
        setStatus(result ? 'Writing…' : `Using ${call.tool}…`);
      },
      onToken: (chunk, full) => { ensureMessage(); paintStream(full); },
    };

    try {
      const final = teamMode
        ? await CoctusAgent.runTeam({ history, userText: fullUserText, userContent, model, execModel, execProvider, systemPreamble, webSearch: liveSearch, tools, signal: state.signal, callbacks })
        : await CoctusAgent.run({ history, userText: fullUserText, userContent, model, execModel, execProvider, systemPreamble, agentic, webSearch: liveSearch, runToCompletion, tools, criticModel, temperature: persona.temp, deepResearch, showThinking, signal: state.signal, callbacks });

      const rawFinal = streamed || final || '';
      const parsedFinal = splitThinking(rawFinal);
      const answerOnly = parsedFinal.tagged ? parsedFinal.answer : rawFinal;
      const thinkingOnly = parsedFinal.tagged ? parsedFinal.thinking : '';

      if (!contentEl) { els.typingIndicator.classList.add('hidden'); contentEl = appendMessageEl('assistant', answerOnly, true, badge); bodyEl = contentEl.parentElement; }
      else if (rawFinal !== streamed || parsedFinal.tagged) { contentEl.innerHTML = renderMarkdown(answerOnly); decorateCodeBlocks(contentEl, bodyEl); }
      if (thinkingOnly) setThinking(contentEl, thinkingOnly);
      contentEl.dataset.raw = answerOnly;
      if (trace) { if (trace.hasContent()) trace.finish(); else trace.remove(); }

      const savedMsg = { role: 'assistant', content: answerOnly };
      if (thinkingOnly) savedMsg.thinking = thinkingOnly;
      state.session.messages.push(savedMsg);
      CoctusMemory.saveSession(state.session);
    } catch (err) {
      els.typingIndicator.classList.add('hidden');
      if (err instanceof CoctusModels.CancelledError) {
        const parsedPartial = splitThinking(streamed.trim());
        const partial = parsedPartial.tagged ? parsedPartial.answer.trim() : streamed.trim();
        if (contentEl && partial) {
          contentEl.dataset.raw = partial;
          if (trace) trace.addRow('Stopped — generation was interrupted before it finished.', 'round-row');
          const savedMsg = { role: 'assistant', content: partial };
          if (parsedPartial.tagged && parsedPartial.thinking) savedMsg.thinking = parsedPartial.thinking;
          state.session.messages.push(savedMsg);
          CoctusMemory.saveSession(state.session);
        } else if (!contentEl) {
          appendMessageEl('assistant', '_Stopped before generating a response._');
        }
        if (trace && trace.hasContent()) trace.finish();
      } else {
        appendMessageEl('assistant', buildErrorMessage(err));
      }
    } finally {
      state.signal = null;
      setGenerating(false);
      setStatus('');
      refreshAuthStatus();
      refreshKeyPoolStatus();
    }
  }

  function buildErrorMessage(err) {
    const msg = String(err && err.message || err || 'Unknown error');
    const provider = CoctusModels.getProvider();
    const lower = msg.toLowerCase();
    if (/rate.?limit|429/.test(lower)) {
      return `Rate limited: ${msg}\n\nOpenRouter's free tier is 20 requests/min, 50/day (1000/day once you've ever added $10+ in credits). Wait a bit, switch to a different free model, or add another key for automatic rotation.`;
    }
    if (provider === CoctusModels.PROVIDERS.OPENROUTER && (/no openrouter api key/i.test(msg) || !CoctusModels.openRouterKeyPresent())) {
      return `${msg}\n\nAdd a key in Settings → Provider, or in key.js for a local-only copy.`;
    }
    if (provider === CoctusModels.PROVIDERS.OPENROUTER) {
      return `Something went wrong reaching OpenRouter: ${msg}\n\nCheck your connection and the key status in Settings, then try again. If this keeps happening, try a different model — free models occasionally go down individually.`;
    }
    return `Something went wrong reaching the model: ${msg}\n\nCheck that you're signed in with Puter (sidebar) and try again.`;
  }

  function stopGenerating() { if (state.signal) state.signal.cancelled = true; }
  function setGenerating(on) {
    state.generating = on;
    updateSendEnabled();
    els.app.classList.toggle('generating', on);
    els.sendBtn.classList.toggle('hidden', on);
    els.stopBtn.classList.toggle('hidden', !on);
  }
  function updateSendEnabled() { els.sendBtn.disabled = state.generating || state.attachments.some(a => a.kind === 'loading'); }

  // ================= attachments =================
  const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
  async function handleFileAttach(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    els.fileAttach.value = '';
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast(`"${file.name}" is ${formatBytes(file.size)} — over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit, so it wasn't attached.`, 'error', 7000);
        continue;
      }
      const placeholder = { name: file.name, mime: file.type, size: file.size, kind: 'loading' };
      state.attachments.push(placeholder);
      renderAttachPreview();
      const processed = await CoctusFiles.process(file);
      const idx = state.attachments.indexOf(placeholder);
      if (idx !== -1) state.attachments[idx] = processed;
      renderAttachPreview();
    }
  }
  function removeAttachment(att) { state.attachments = state.attachments.filter(a => a !== att); renderAttachPreview(); }
  function clearAttachments() { state.attachments = []; renderAttachPreview(); }
  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  function renderAttachPreview() {
    updateSendEnabled();
    els.attachPreview.classList.toggle('hidden', state.attachments.length === 0);
    els.attachPreview.innerHTML = '';
    state.attachments.forEach(att => {
      const chip = document.createElement('div'); chip.className = 'attach-chip';
      const icon = att.kind === 'loading' ? '⏳' : att.kind === 'image' ? '🖼️' : att.kind === 'unsupported' ? '📦' : '📄';
      chip.innerHTML = `<span class="attach-chip-icon">${icon}</span><span class="attach-chip-name">${escapeHtml(att.name)}</span><span class="attach-chip-size">${formatBytes(att.size)}</span>`;
      const btn = document.createElement('button'); btn.textContent = '✕';
      btn.addEventListener('click', () => removeAttachment(att));
      chip.appendChild(btn);
      els.attachPreview.appendChild(chip);
    });
  }

  // ================= memory modal =================
  function renderMemoryList() {
    const facts = CoctusMemory.getFacts();
    els.memoryList.innerHTML = '';
    if (!facts.length) { els.memoryList.innerHTML = '<p class="memory-empty">No saved facts yet. Mention something worth remembering in chat, or add one below.</p>'; return; }
    facts.forEach(f => {
      const item = document.createElement('div'); item.className = 'memory-item' + (f.pinned ? ' pinned' : '');
      const text = document.createElement('span'); text.textContent = f.text; text.title = 'Click to edit'; text.className = 'memory-text';
      text.addEventListener('click', () => { const next = prompt('Edit fact:', f.text); if (next !== null && next.trim()) { CoctusMemory.editFact(f.id, next); renderMemoryList(); } });
      item.appendChild(text);
      const pin = document.createElement('button'); pin.textContent = f.pinned ? '📌' : '📍';
      pin.title = f.pinned ? 'Pinned — click to unpin' : 'Pin — always include this fact';
      pin.addEventListener('click', () => { CoctusMemory.togglePinFact(f.id); renderMemoryList(); });
      item.appendChild(pin);
      const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Delete';
      del.addEventListener('click', () => { CoctusMemory.removeFact(f.id); renderMemoryList(); });
      item.appendChild(del);
      els.memoryList.appendChild(item);
    });
  }

  // ================= theme =================
  const THEME_KEY = 'coctus_theme_v1';
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
    const dark = document.getElementById('hljsDark'); const light = document.getElementById('hljsLight');
    if (dark && light) { dark.disabled = theme === 'light'; light.disabled = theme !== 'light'; }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14131A' : '#8b5cf6');
  }
  function initTheme() {
    let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch {}
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Coctus: service worker registration failed', err));
  }

  // ================= misc helpers =================
  function autoResizeTextarea() {
    els.composerInput.style.height = 'auto';
    els.composerInput.style.height = Math.min(els.composerInput.scrollHeight, 200) + 'px';
  }
  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function safeName(s) { return (s || 'coctus').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'coctus'; }

  const toastStack = document.getElementById('toastStack');
  function showToast(message, kind = 'info', durationMs = 5000) {
    if (!toastStack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind !== 'info' ? ` ${kind}` : '');
    el.textContent = message;
    toastStack.appendChild(el);
    const remove = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
    setTimeout(remove, durationMs);
    el.addEventListener('click', remove);
  }
  function setStatus(text) { els.topbarStatus.textContent = text || ''; }

  // ================= events =================
  function bindEvents() {
    els.composerForm.addEventListener('submit', handleSend);
    els.stopBtn.addEventListener('click', stopGenerating);
    els.composerInput.addEventListener('input', autoResizeTextarea);
    els.composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.composerForm.requestSubmit(); }
    });
    els.newChatBtn.addEventListener('click', newSession);
    els.authBtn.addEventListener('click', handleAuthClick);
    els.fileAttach.addEventListener('change', handleFileAttach);

    els.toggleSidebar.addEventListener('click', toggleSidebarDrawer);
    els.closeSidebar.addEventListener('click', closeSidebarDrawer);
    els.backdrop.addEventListener('click', closeSidebarDrawer);

    els.themeToggle.addEventListener('click', toggleTheme);

    // ---------- settings modal ----------
    const openSettings = () => openModal(els.settingsModal);
    els.settingsBtn.addEventListener('click', openSettings);
    els.settingsTopBtn.addEventListener('click', openSettings);
    els.modelPickerBtn.addEventListener('click', openSettings);
    els.closeSettings.addEventListener('click', () => closeModal(els.settingsModal));

    els.modelSelect.addEventListener('change', () => { state.session.model = els.modelSelect.value; CoctusMemory.saveSession(state.session); updateTopbar(); });
    els.agentToggle.addEventListener('change', () => CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), agentic: els.agentToggle.checked }));
    els.researchToggle.addEventListener('change', () => { CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), research: els.researchToggle.checked }); renderQuickChips(); });
    els.completionToggle.addEventListener('change', () => CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), runToCompletion: els.completionToggle.checked }));
    els.toolsToggle.addEventListener('change', () => { CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), tools: els.toolsToggle.checked }); renderQuickChips(); });
    els.thinkingToggle.addEventListener('change', () => { CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), showThinking: els.thinkingToggle.checked }); renderQuickChips(); });

    els.hybridToggle.addEventListener('change', async () => {
      els.execModelSelect.classList.toggle('hidden', !els.hybridToggle.checked);
      CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), hybridExec: els.hybridToggle.checked });
      if (els.hybridToggle.checked) await populateExecModels(CoctusMemory.getPrefs().execModel);
    });
    els.execModelSelect.addEventListener('change', () => CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), execModel: els.execModelSelect.value }));

    els.deepResearchToggle.addEventListener('change', () => {
      if (els.deepResearchToggle.checked) { els.teamToggle.checked = false; }
      CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), deepResearch: els.deepResearchToggle.checked, teamMode: els.teamToggle.checked });
      renderQuickChips();
    });
    els.teamToggle.addEventListener('change', () => {
      if (els.teamToggle.checked) { els.deepResearchToggle.checked = false; }
      CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), teamMode: els.teamToggle.checked, deepResearch: els.deepResearchToggle.checked });
      renderQuickChips();
    });
    els.criticSelect.addEventListener('change', () => CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), criticModel: els.criticSelect.value }));

    els.personaRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.persona-chip'); if (!chip) return;
      setActivePersonaChip(chip.dataset.persona);
      CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), persona: chip.dataset.persona });
    });

    els.openrouterKeySaveBtn.addEventListener('click', async () => {
      const key = els.openrouterKeyInput.value.trim();
      if (!key) return;
      const existing = CoctusModels.getLocalOpenRouterKeys();
      CoctusModels.setLocalOpenRouterKeys([...existing, key]);
      els.openrouterKeyInput.value = '';
      showToast('OpenRouter key saved to this browser.');
      await populateModels();
    });

    els.providerRow.addEventListener('click', async (e) => {
      const chip = e.target.closest('.persona-chip'); if (!chip) return;
      const p = chip.dataset.provider;
      CoctusModels.setProvider(p);
      CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), provider: p });
      setActiveProviderChip(p);
      await populateModels();
    });

    els.sessionSearch.addEventListener('input', renderSessionList);

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null; let listening = false;
    if (SpeechRecognitionCtor) {
      els.micBtn.addEventListener('click', () => {
        if (listening) { recognizer && recognizer.stop(); return; }
        recognizer = new SpeechRecognitionCtor();
        recognizer.lang = navigator.language || 'en-US';
        recognizer.interimResults = false;
        recognizer.maxAlternatives = 1;
        recognizer.onstart = () => { listening = true; els.micBtn.classList.add('recording'); setStatus('Listening…'); };
        recognizer.onerror = () => { listening = false; els.micBtn.classList.remove('recording'); setStatus(''); };
        recognizer.onend = () => { listening = false; els.micBtn.classList.remove('recording'); setStatus(''); };
        recognizer.onresult = (e) => {
          const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
          els.composerInput.value = (els.composerInput.value ? els.composerInput.value + ' ' : '') + transcript;
          autoResizeTextarea();
          els.composerInput.focus();
        };
        try { recognizer.start(); } catch {}
      });
    } else if (els.micBtn) {
      els.micBtn.disabled = true;
      els.micBtn.title = 'Voice input needs browser speech recognition support (not available here)';
    }

    els.profileSaveBtn.addEventListener('click', () => {
      CoctusMemory.saveProfile({ name: els.profileName.value.trim(), role: els.profileRole.value.trim(), preferences: els.profilePrefs.value.trim() });
      showToast('Profile saved.');
    });

    els.backupExportBtn.addEventListener('click', () => {
      const json = CoctusMemory.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `coctus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    els.backupImportInput.addEventListener('change', async () => {
      const file = els.backupImportInput.files[0]; if (!file) return;
      try {
        const text = await file.text();
        const { importedSessions, importedFacts } = CoctusMemory.importBackup(text);
        showToast(`Imported ${importedSessions} session(s) and ${importedFacts} fact(s).`);
        renderSessionList(); renderMemoryList();
        const profile = CoctusMemory.getProfile();
        els.profileName.value = profile.name || ''; els.profileRole.value = profile.role || ''; els.profilePrefs.value = profile.preferences || '';
      } catch (err) { showToast('Could not import that file: ' + err.message, 'error'); }
      finally { els.backupImportInput.value = ''; }
    });

    // ---------- command palette ----------
    function paletteCommands() {
      const cmds = [
        { label: 'New chat', run: newSession },
        { label: 'Toggle theme', run: toggleTheme },
        { label: 'Open settings', run: openSettings },
        { label: 'Open memory', run: () => { renderMemoryList(); openModal(els.memoryModal); } },
        { label: 'Export chat…', run: () => openModal(els.exportModal) },
        { label: 'Toggle agentic planning', run: () => { els.agentToggle.checked = !els.agentToggle.checked; els.agentToggle.dispatchEvent(new Event('change')); } },
        { label: 'Toggle web search', run: () => { els.researchToggle.checked = !els.researchToggle.checked; els.researchToggle.dispatchEvent(new Event('change')); renderQuickChips(); } },
        { label: 'Toggle tools', run: () => { els.toolsToggle.checked = !els.toolsToggle.checked; els.toolsToggle.dispatchEvent(new Event('change')); renderQuickChips(); } },
        { label: 'Toggle run to completion', run: () => { els.completionToggle.checked = !els.completionToggle.checked; els.completionToggle.dispatchEvent(new Event('change')); } },
        { label: 'Clear all data…', run: () => els.clearBtn.click() },
      ];
      Object.entries(PERSONAS).forEach(([id, p]) => {
        cmds.push({ label: `Switch to ${p.label} mode`, run: () => { setActivePersonaChip(id); CoctusMemory.savePrefs({ ...CoctusMemory.getPrefs(), persona: id }); } });
      });
      CoctusMemory.getSessions().slice(0, 30).forEach(s => cmds.push({ label: `Open chat: ${s.title}`, run: () => switchSession(s.id) }));
      return cmds;
    }
    function renderPalette(query) {
      const q = (query || '').toLowerCase();
      const matches = paletteCommands().filter(c => c.label.toLowerCase().includes(q)).slice(0, 12);
      els.paletteResults.innerHTML = '';
      if (!matches.length) { els.paletteResults.innerHTML = '<div class="palette-empty">No matching commands</div>'; return; }
      matches.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'palette-row' + (i === 0 ? ' active' : '');
        row.textContent = c.label;
        row.addEventListener('click', () => { c.run(); closePalette(); });
        els.paletteResults.appendChild(row);
      });
    }
    function openPalette() { openModal(els.paletteModal, els.paletteInput); els.paletteInput.value = ''; renderPalette(''); }
    function closePalette() { closeModal(els.paletteModal); }
    els.paletteBtn.addEventListener('click', openPalette);
    els.paletteInput.addEventListener('input', () => renderPalette(els.paletteInput.value));
    els.paletteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = els.paletteResults.querySelector('.palette-row'); if (first) first.click(); } });
    els.paletteModal.addEventListener('click', (e) => { if (e.target === els.paletteModal) closePalette(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); els.paletteModal.classList.contains('hidden') ? openPalette() : closePalette(); }
    });

    function openModal(modal, focusEl) {
      modal.__trigger = document.activeElement;
      modal.classList.remove('hidden');
      const target = focusEl || modal.querySelector('input, button, [tabindex]');
      if (target) setTimeout(() => target.focus(), 0);
    }
    function closeModal(modal) {
      modal.classList.add('hidden');
      if (modal.__trigger && typeof modal.__trigger.focus === 'function') modal.__trigger.focus();
    }
    function topmostOpenModal() {
      return [els.paletteModal, els.memoryModal, els.exportModal, els.settingsModal].find(m => !m.classList.contains('hidden'));
    }
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const open = topmostOpenModal(); if (open) closeModal(open); });

    els.memoryBtn.addEventListener('click', () => { renderMemoryList(); openModal(els.memoryModal); if (isMobile()) closeSidebarDrawer(); });
    els.closeMemory.addEventListener('click', () => closeModal(els.memoryModal));
    els.memoryAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = els.memoryAddInput.value.trim();
      if (v) { CoctusMemory.addFact(v); els.memoryAddInput.value = ''; renderMemoryList(); }
    });

    els.exportBtn.addEventListener('click', () => { openModal(els.exportModal); if (isMobile()) closeSidebarDrawer(); });
    els.closeExport.addEventListener('click', () => closeModal(els.exportModal));
    els.exportModal.querySelectorAll('.export-opt').forEach(btn => {
      btn.addEventListener('click', () => { CoctusDocuments.exportSession(state.session, btn.dataset.format); closeModal(els.exportModal); });
    });

    els.clearBtn.addEventListener('click', () => {
      if (!confirm('Clear all chats and saved memory on this device? This cannot be undone.')) return;
      CoctusMemory.clearAll();
      state.session = CoctusMemory.createSession();
      renderSessionList(); renderMessages();
    });

    [els.memoryModal, els.exportModal, els.settingsModal].forEach(modal => {
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });
  }

  init();
})();
