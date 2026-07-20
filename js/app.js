/**
 * app.js — UI wiring for Coctus AI. No build step, no backend: this file
 * plus Puter.js is the entire application.
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
    sessionCount: document.getElementById('sessionCount'),
    memoryBtn: document.getElementById('memoryBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    sessionTitle: document.getElementById('sessionTitle'),
    topbarStatus: document.getElementById('topbarStatus'),
    togglePlan: document.getElementById('togglePlan'),
    closePlan: document.getElementById('closePlan'),
    planPanel: document.getElementById('planPanel'),
    planBody: document.getElementById('planBody'),
    codeBody: document.getElementById('codeBody'),
    tabTrace: document.getElementById('tabTrace'),
    tabProject: document.getElementById('tabProject'),
    projectCount: document.getElementById('projectCount'),
    projectBody: document.getElementById('projectBody'),
    projectEmpty: document.getElementById('projectEmpty'),
    projectWrap: document.getElementById('projectWrap'),
    projectListToolbar: document.getElementById('projectListToolbar'),
    projectMeta: document.getElementById('projectMeta'),
    projectDownloadZipBtn: document.getElementById('projectDownloadZipBtn'),
    projectClearBtn: document.getElementById('projectClearBtn'),
    projectFileList: document.getElementById('projectFileList'),
    projectFileView: document.getElementById('projectFileView'),
    projectFileBackBtn: document.getElementById('projectFileBackBtn'),
    projectFilePath: document.getElementById('projectFilePath'),
    projectFileCopyBtn: document.getElementById('projectFileCopyBtn'),
    projectFileDownloadBtn: document.getElementById('projectFileDownloadBtn'),
    projectFileCode: document.getElementById('projectFileCode'),
    tabCode: document.getElementById('tabCode'),
    codeCount: document.getElementById('codeCount'),
    codeFileTabs: document.getElementById('codeFileTabs'),
    codeViewerEmpty: document.getElementById('codeViewerEmpty'),
    codeViewerWrap: document.getElementById('codeViewerWrap'),
    codeViewerLang: document.getElementById('codeViewerLang'),
    codeViewerCode: document.getElementById('codeViewerCode'),
    codePreviewBtn: document.getElementById('codePreviewBtn'),
    codeCopyBtn: document.getElementById('codeCopyBtn'),
    codeDownloadBtn: document.getElementById('codeDownloadBtn'),
    codeEditBtn: document.getElementById('codeEditBtn'),
    codeEditArea: document.getElementById('codeEditArea'),
    codeEditBar: document.getElementById('codeEditBar'),
    codeEditRunBtn: document.getElementById('codeEditRunBtn'),
    codeEditAskBtn: document.getElementById('codeEditAskBtn'),
    tabPreview: document.getElementById('tabPreview'),
    previewBody: document.getElementById('previewBody'),
    previewEmpty: document.getElementById('previewEmpty'),
    previewWrap: document.getElementById('previewWrap'),
    previewLang: document.getElementById('previewLang'),
    previewFrame: document.getElementById('previewFrame'),
    previewRefreshBtn: document.getElementById('previewRefreshBtn'),
    previewPopoutBtn: document.getElementById('previewPopoutBtn'),
    themeToggle: document.getElementById('themeToggle'),
    chatScroll: document.getElementById('chatScroll'),
    emptyState: document.getElementById('emptyState'),
    suggestionGrid: document.getElementById('suggestionGrid'),
    messages: document.getElementById('messages'),
    typingIndicator: document.getElementById('typingIndicator'),
    composerForm: document.getElementById('composerForm'),
    composerInput: document.getElementById('composerInput'),
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
    general: { label: 'General', prompt: '', tools: null, temp: null },
    research: {
      label: 'Research',
      prompt: '\nYou are in Research mode: prioritize verified, current information over recalled facts. Use web_search, web_fetch, and wikipedia proactively for anything checkable, prefer citing where a claim came from, and flag uncertainty explicitly rather than guessing.',
      tools: true, temp: 0.3,
    },
    code: {
      label: 'Code',
      prompt: '\nYou are in Code mode: be precise and terse in prose, lead with working code, use js_exec/py_exec to actually verify logic rather than asserting it works, and call out edge cases and assumptions explicitly. When the task is more than one related file (a small app, an Android project, anything with more than one logical file), use write_file to build it as a real project in the workspace panel instead of stacking multiple code blocks in the reply — the user gets a browsable file tree and one .zip download.',
      tools: true, temp: 0.2,
    },
    security: {
      label: 'Security Research',
      prompt: '\nYou are in Security Research mode, for authorized penetration testing, bug bounty, and red team engagement work: think in terms of attack surface, recon/enumeration methodology, and reproducible evidence. Use cert_transparency, web_search, and web_fetch for passive recon, and js_exec/py_exec to actually verify a technique or parse output rather than describing it abstractly. When deliverables span multiple files (a recon report plus a PoC script plus supporting notes, a small custom tool), use write_file to assemble them as a real project the user can download as one .zip. Write findings the way a real report would: what was tested, what was found, how to reproduce it, and concrete remediation — assume the engagement is authorized unless something about the request suggests otherwise.',
      tools: true, temp: 0.25,
    },
    creative: {
      label: 'Creative',
      prompt: '\nYou are in Creative mode: prioritize voice, originality, and flow. Only reach for tools when a concrete fact genuinely needs checking — otherwise write freely.',
      tools: null, temp: 0.9,
    },
  };
  function getPersona() {
    const prefs = LocxyMemory.getPrefs();
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
    attachments: [], // [{ name, mime, size, kind, text?, dataUrl? }]
    codeSnippets: [], // { id, lang, code }
    activeCodeId: null,
    codeEdits: {}, // { [snippetId]: editedCode } — local-only edits, never mutate the original snippet
    editingCode: false,
    currentPreview: null, // { lang, code }
  };
  let snippetSeq = 0;

  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
  const isOverlayPlan = () => window.matchMedia('(max-width: 1080px)').matches;

  // ---------- init ----------
  async function init() {
    LocxyMemory.onStorageError((err, key, info) => {
      if (info && info.recovered) {
        showToast(`Storage was nearly full — freed space by removing ${info.droppedCount} older unstarred session(s). Star any sessions you want kept.`, 'warn', 8000);
      } else {
        showToast(`Could not save changes — your browser's storage for this site is full. Try exporting and clearing old sessions.`, 'error', 8000);
      }
    });
    window.addEventListener('offline', () => showToast("You're offline — requests to the model will fail until your connection is back.", 'warn', 20000));
    window.addEventListener('online', () => showToast('Back online.', 'info', 3000));
    initTheme();
    registerServiceWorker();
    renderSuggestions();
    const savedProvider = LocxyMemory.getPrefs().provider;
    const validProviders = [LocxyModels.PROVIDERS.OPENROUTER, LocxyModels.PROVIDERS.PUTER];
    LocxyModels.setProvider(validProviders.includes(savedProvider) ? savedProvider : LocxyModels.PROVIDERS.PUTER);
    setActiveProviderChip(LocxyModels.getProvider());
    await populateModels();
    const prefs = LocxyMemory.getPrefs();
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
    const profile = LocxyMemory.getProfile();
    els.profileName.value = profile.name || '';
    els.profileRole.value = profile.role || '';
    els.profilePrefs.value = profile.preferences || '';

    const activeId = LocxyMemory.getActiveId();
    const existing = activeId && LocxyMemory.getSession(activeId);
    state.session = existing || LocxyMemory.createSession();
    if (!state.session.model) state.session.model = els.modelSelect.value;

    // Sidebar starts closed on phones, open on larger screens.
    if (isMobile()) els.app.classList.add('sidebar-collapsed');

    renderSessionList();
    renderMessages();
    autoResizeTextarea();
    bindEvents();
    refreshAuthStatus();
  }

  // ---------- auth status ----------
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
        els.authStatus.textContent = `Signed in as ${user.username}`;
      } catch {
        els.authStatus.textContent = 'Signed in';
      }
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
      if (puter.auth.isSignedIn()) {
        puter.auth.signOut();
      } else {
        await puter.auth.signIn();
      }
    } catch (err) {
      console.warn('Coctus: auth action failed or was cancelled.', err);
    } finally {
      els.authBtn.disabled = false;
      refreshAuthStatus();
    }
  }

  function refreshKeyPoolStatus() {
    if (LocxyModels.getProvider() !== LocxyModels.PROVIDERS.OPENROUTER) {
      els.openrouterKeyStatus.classList.add('hidden');
      return;
    }
    const status = LocxyModels.openRouterKeyPoolStatus();
    if (!status.length) { els.openrouterKeyStatus.classList.add('hidden'); return; }
    const cooling = status.filter(s => s.cooling);
    let text = status.length === 1
      ? `1 OpenRouter key loaded.`
      : `${status.length} OpenRouter keys loaded — rotating automatically.`;
    if (cooling.length) {
      text += ` ${cooling.length} cooling down (rate-limited/out of quota), ${status.length - cooling.length} available.`;
    }
    els.openrouterKeyStatus.textContent = text;
    els.openrouterKeyStatus.classList.remove('hidden');
  }

  async function populateModels() {
    const prefs = LocxyMemory.getPrefs();
    const provider = LocxyModels.getProvider();
    const modelPrefKey = provider === LocxyModels.PROVIDERS.OPENROUTER ? 'openrouterModel' : 'model';

    els.openrouterKeyWarning.classList.toggle('hidden', provider !== LocxyModels.PROVIDERS.OPENROUTER || LocxyModels.openRouterKeyPresent());
    els.openrouterKeyEntry.classList.toggle('hidden', provider !== LocxyModels.PROVIDERS.OPENROUTER);
    refreshKeyPoolStatus();

    els.modelSelect.innerHTML = '';
    els.criticSelect.innerHTML = '<option value="">None — skip cross-model review</option>';

    let models = [];
    try {
      models = await LocxyModels.listModels();
    } catch (err) {
      console.warn('Coctus: could not load model list', err);
      const opt = document.createElement('option');
      opt.textContent = provider === LocxyModels.PROVIDERS.OPENROUTER
        ? 'Could not reach OpenRouter — check your connection and key.js'
        : 'Could not load models';
      els.modelSelect.appendChild(opt);
      return;
    }

    if (!models.length) {
      const opt = document.createElement('option');
      opt.textContent = provider === LocxyModels.PROVIDERS.OPENROUTER
        ? 'No free models found right now on OpenRouter'
        : 'No models available';
      els.modelSelect.appendChild(opt);
      return;
    }

    const groups = {};
    models.forEach(m => { (groups[m.group] ||= []).push(m); });

    Object.entries(groups).forEach(([group, list]) => {
      const og = document.createElement('optgroup');
      og.label = group;
      list.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.label;
        og.appendChild(opt);
      });
      els.modelSelect.appendChild(og);
    });
    if (prefs[modelPrefKey] && models.some(m => m.id === prefs[modelPrefKey])) els.modelSelect.value = prefs[modelPrefKey];

    // Mirror the same catalogue into the "second opinion" critic model picker.
    Object.entries(groups).forEach(([group, list]) => {
      const og = document.createElement('optgroup');
      og.label = group;
      list.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.label;
        og.appendChild(opt);
      });
      els.criticSelect.appendChild(og);
    });
    if (prefs.criticModel && models.some(m => m.id === prefs.criticModel)) els.criticSelect.value = prefs.criticModel;
  }

  // Populates the "execute with a different model" dropdown from the SAME
  // provider's model catalogue currently active for planning — hybrid mode
  // now means "two models, one provider" (e.g. a stronger reasoning model
  // for planning, a faster/cheaper one for the actual writing), not a
  // separate local runtime.
  async function populateExecModels(preferredId) {
    els.execModelSelect.innerHTML = '<option>Loading models…</option>';
    els.execModelSelect.disabled = true;
    let models = [];
    try {
      models = await LocxyModels.listModels();
    } catch (err) {
      els.execModelSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.textContent = 'Could not load models for execution';
      els.execModelSelect.appendChild(opt);
      return;
    }
    els.execModelSelect.innerHTML = '';
    if (!models.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No models available';
      els.execModelSelect.appendChild(opt);
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
    els.providerRow.querySelectorAll('.persona-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.provider === p);
    });
  }

  function setActivePersonaChip(id) {
    if (!els.personaRow) return;
    els.personaRow.querySelectorAll('.persona-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.persona === id);
    });
  }

  // ---------- drawers (mobile sidebar + tablet/mobile workspace panel) ----------
  function updateBackdrop() {
    const sidebarOpenOverlay = isMobile() && !els.app.classList.contains('sidebar-collapsed');
    const planOpenOverlay = isOverlayPlan() && els.app.classList.contains('plan-open');
    els.backdrop.classList.toggle('hidden', !(sidebarOpenOverlay || planOpenOverlay));
  }
  function openSidebar() { els.app.classList.remove('sidebar-collapsed'); updateBackdrop(); }
  function closeSidebarDrawer() { if (isMobile()) els.app.classList.add('sidebar-collapsed'); updateBackdrop(); }
  function toggleSidebarDrawer() { els.app.classList.toggle('sidebar-collapsed'); updateBackdrop(); }
  function openPlanPanel() { els.app.classList.add('plan-open'); updateBackdrop(); }
  function closePlanPanel() { els.app.classList.remove('plan-open'); updateBackdrop(); }
  function togglePlanPanel() { els.app.classList.toggle('plan-open'); updateBackdrop(); }

  // ---------- sessions ----------
  function renderSessionList() {
    const query = els.sessionSearch ? els.sessionSearch.value : '';
    const sessions = query ? LocxyMemory.searchSessions(query) : LocxyMemory.getSessions();
    els.sessionCount.textContent = LocxyMemory.getSessions().length;
    els.sessionList.innerHTML = '';
    if (query && !sessions.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = `No sessions match "${query}".`;
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
      item.querySelector('.star').addEventListener('click', (e) => {
        e.stopPropagation();
        LocxyMemory.toggleStarSession(s.id);
        renderSessionList();
      });
      item.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        LocxyMemory.deleteSession(s.id);
        if (s.id === state.session.id) {
          const remaining = LocxyMemory.getSessions();
          state.session = remaining[0] || LocxyMemory.createSession();
        }
        renderSessionList();
        renderMessages();
      });
      els.sessionList.appendChild(item);
    });
  }

  function switchSession(id) {
    const s = LocxyMemory.getSession(id);
    if (!s) return;
    state.session = s;
    LocxyMemory.setActiveId(id);
    if (s.model) els.modelSelect.value = s.model;
    renderSessionList();
    renderMessages();
    resetWorkspacePanel();
  }

  function newSession() {
    state.session = LocxyMemory.createSession();
    state.session.model = els.modelSelect.value;
    LocxyMemory.saveSession(state.session);
    renderSessionList();
    renderMessages();
    resetWorkspacePanel();
    if (isMobile()) closeSidebarDrawer();
    els.composerInput.focus();
  }

  // ---------- messages ----------
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
    const avatar = document.createElement('div');
    avatar.className = 'avatar ' + (role === 'user' ? 'avatar-user' : 'avatar-ai');
    avatar.textContent = role === 'user' ? 'You' : 'L';
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
      copyBtn.className = 'msg-action';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content_.textContent).then(() => {
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        }).catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
      });
      actions.appendChild(copyBtn);

      if (LocxyModels.ttsAvailable()) {
        const listenBtn = document.createElement('button');
        listenBtn.className = 'msg-action';
        listenBtn.textContent = '🔊 Listen';
        let audioEl = null;
        listenBtn.addEventListener('click', async () => {
          if (audioEl) { audioEl.paused ? audioEl.play() : audioEl.pause(); return; }
          listenBtn.textContent = '⏳ Loading…';
          listenBtn.disabled = true;
          try {
            audioEl = await LocxyModels.speak(content_.dataset.raw || content);
            listenBtn.disabled = false;
            listenBtn.textContent = '⏸ Pause';
            audioEl.addEventListener('ended', () => { listenBtn.textContent = '🔊 Listen'; audioEl = null; });
            audioEl.addEventListener('pause', () => { if (audioEl) listenBtn.textContent = '▶ Resume'; });
            audioEl.addEventListener('play', () => { listenBtn.textContent = '⏸ Pause'; });
            audioEl.play();
          } catch (err) {
            listenBtn.disabled = false;
            listenBtn.textContent = '🔊 Listen';
            console.warn('Coctus: TTS failed', err);
          }
        });
        actions.appendChild(listenBtn);
      }

      const title = () => (state.session.title || 'locxy-response');
      const mdBtn = document.createElement('button');
      mdBtn.className = 'msg-action'; mdBtn.textContent = 'Download .md';
      mdBtn.addEventListener('click', () => LocxyDocuments.downloadMessageAsMarkdown(content_.dataset.raw || content, title()));
      actions.appendChild(mdBtn);

      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'msg-action'; pdfBtn.textContent = 'Download .pdf';
      pdfBtn.addEventListener('click', () => LocxyDocuments.downloadMessageAsPdf(content_.dataset.raw || content, title()));
      actions.appendChild(pdfBtn);

      const docBtn = document.createElement('button');
      docBtn.className = 'msg-action'; docBtn.textContent = 'Download .docx';
      docBtn.addEventListener('click', () => LocxyDocuments.downloadMessageAsDocx(content_.innerHTML, title()));
      actions.appendChild(docBtn);

      body.appendChild(actions);
    }
    content_.dataset.raw = content;

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    els.messages.appendChild(wrap);
    decorateCodeBlocks(content_, body);
    if (animate) scrollToBottom();
    return content_;
  }

  function renderMarkdown(text) {
    try {
      marked.setOptions({ breaks: true, gfm: true });
      const html = marked.parse(text || '');
      return DOMPurify.sanitize(html);
    } catch {
      return escapeHtml(text);
    }
  }

  /**
   * Splits a raw model response into { thinking, answer, tagged } based on
   * <thinking>...</thinking><answer>...</answer> wrapper tags, tolerating a
   * still-streaming (unclosed) buffer. tagged=false means the model didn't
   * use the wrapper (Show thinking was off, or a revision pass regenerated
   * plain text) — callers should just render the whole string as-is then.
   */
  function splitThinking(text) {
    if (!text || !text.includes('<thinking>')) return { thinking: '', answer: text || '', tagged: false };
    const thinkMatch = text.match(/<thinking>([\s\S]*?)(<\/thinking>|$)/);
    const answerMatch = text.match(/<answer>([\s\S]*?)(<\/answer>|$)/);
    return {
      thinking: thinkMatch ? thinkMatch[1].trim() : '',
      answer: answerMatch ? answerMatch[1] : '',
      tagged: true,
    };
  }

  /** Lazily creates (once) and updates the collapsible reasoning panel above a message's content. */
  function setThinking(contentEl, text) {
    if (!contentEl || !text) return;
    if (!contentEl._thinkingEl) {
      const details = document.createElement('details');
      details.className = 'msg-thinking';
      const summary = document.createElement('summary');
      summary.textContent = '🧠 Thinking';
      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'msg-thinking-body';
      details.appendChild(summary);
      details.appendChild(bodyDiv);
      contentEl.parentElement.insertBefore(details, contentEl);
      contentEl._thinkingEl = bodyDiv;
    }
    contentEl._thinkingEl.innerHTML = renderMarkdown(text);
  }

  function decorateCodeBlocks(container, body) {
    const blocksForZip = [];
    container.querySelectorAll('pre code').forEach((block, i) => {
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
        const langTag = document.createElement('span');
        langTag.className = 'code-block-lang';
        langTag.textContent = lang;
        wrap.appendChild(langTag);
      }

      const toolbar = document.createElement('div');
      toolbar.className = 'code-block-toolbar';

      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => openInCodeViewer(lang, code));
      toolbar.appendChild(openBtn);

      if (isPreviewable(lang)) {
        const previewBtn = document.createElement('button');
        previewBtn.textContent = '▶ Preview';
        previewBtn.className = 'preview-trigger';
        previewBtn.addEventListener('click', () => openInPreview(lang, code));
        toolbar.appendChild(previewBtn);
      }

      const dlBtn = document.createElement('button');
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', () => LocxyDocuments.downloadCodeBlock(code, lang));
      toolbar.appendChild(dlBtn);

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        }).catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
      });
      toolbar.appendChild(copyBtn);

      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Project';
      addBtn.title = 'Add this file to the project workspace';
      addBtn.addEventListener('click', () => {
        const suggested = suggestFilename(lang, code);
        const path = prompt('Add to project as:', suggested);
        if (!path) return;
        const existed = LocxyWorkspace.readFile(path) !== null;
        LocxyWorkspace.writeFile(path, code);
        renderProjectPanel();
        showToast(existed ? `Overwrote "${path}" in the project.` : `Added "${path}" to the project.`);
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
        zipBtn.addEventListener('click', () => LocxyDocuments.downloadBlocksAsZip(blocksForZip, state.session.title || 'locxy-files'));
        actions.appendChild(zipBtn);
      }
      const COMBINABLE = new Set(['html', 'htm', 'css', 'js', 'javascript']);
      const combo = blocksForZip.filter(b => COMBINABLE.has(String(b.lang || '').toLowerCase()));
      if (actions && combo.length >= 2 && !actions.querySelector('.combo-preview-action')) {
        const comboBtn = document.createElement('button');
        comboBtn.className = 'msg-action combo-preview-action';
        comboBtn.textContent = `▶ Preview as one app (${combo.length} files)`;
        comboBtn.addEventListener('click', () => openInPreviewCombined(combo));
        actions.appendChild(comboBtn);
      }
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { els.chatScroll.scrollTop = els.chatScroll.scrollHeight; });
  }

  // ---------- workspace panel: tabs ----------
  function switchWorkspaceTab(tab) {
    els.tabTrace.classList.toggle('active', tab === 'trace');
    els.tabProject.classList.toggle('active', tab === 'project');
    els.tabCode.classList.toggle('active', tab === 'code');
    els.tabPreview.classList.toggle('active', tab === 'preview');
    els.planBody.classList.toggle('hidden', tab !== 'trace');
    els.projectBody.classList.toggle('hidden', tab !== 'project');
    els.codeBody.classList.toggle('hidden', tab !== 'code');
    els.previewBody.classList.toggle('hidden', tab !== 'preview');
    if (tab === 'project') renderProjectPanel();
  }

  // ---------- project workspace ----------
  function renderProjectPanel() {
    const files = LocxyWorkspace.listFiles();
    els.projectCount.textContent = String(files.length);
    els.projectCount.classList.toggle('hidden', files.length === 0);
    els.projectEmpty.classList.toggle('hidden', files.length > 0);
    els.projectWrap.classList.toggle('hidden', files.length === 0);
    if (!files.length) return;
    els.projectMeta.textContent = `${files.length} file${files.length === 1 ? '' : 's'} · ${formatBytes(LocxyWorkspace.totalBytes())}`;
    els.projectFileList.innerHTML = '';
    files.forEach(f => {
      const row = document.createElement('div');
      row.className = 'project-file-row';
      row.innerHTML = `<span class="path">${escapeHtml(f.path)}</span><span class="size">${formatBytes(f.size)}</span>`;
      row.addEventListener('click', () => openProjectFile(f.path));
      els.projectFileList.appendChild(row);
    });
  }

  function openProjectFile(path) {
    const content = LocxyWorkspace.readFile(path);
    if (content === null) return;
    els.projectFilePath.textContent = path;
    els.projectFileCode.textContent = content;
    els.projectFileCode.className = `language-${guessLangFromPath(path)}`;
    try { hljs.highlightElement(els.projectFileCode); } catch {}
    els.projectFileList.classList.add('hidden');
    els.projectListToolbar.classList.add('hidden');
    els.projectFileView.classList.remove('hidden');
  }

  function closeProjectFile() {
    els.projectFileView.classList.add('hidden');
    els.projectFileList.classList.remove('hidden');
    els.projectListToolbar.classList.remove('hidden');
  }

  // Best-effort filename suggestion for "+ Project" — first line comment
  // hints (# file: foo.py, // src/App.jsx) if the model left one, otherwise
  // a generic name from the block's language.
  function suggestFilename(lang, code) {
    const firstLine = (code || '').split('\n')[0] || '';
    const hinted = firstLine.match(/(?:file|filename|path)\s*[:=]\s*["'`]?([\w./-]+\.\w+)/i);
    if (hinted) return hinted[1];
    const ext = LocxyDocuments.extFor(lang);
    return `file.${ext}`;
  }

  function guessLangFromPath(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python',
      html: 'html', htm: 'html', css: 'css', scss: 'scss', json: 'json',
      md: 'markdown', sh: 'bash', java: 'java', kt: 'kotlin', gradle: 'groovy',
      xml: 'xml', yml: 'yaml', yaml: 'yaml', c: 'c', cpp: 'cpp', cs: 'csharp',
      go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql', swift: 'swift',
    };
    return map[ext] || 'plaintext';
  }

  // ---------- live preview / artifacts ----------
  // Which languages we know how to actually run in an isolated iframe,
  // the way Claude's canvas renders a live artifact instead of just text.
  const PREVIEWABLE_LANGS = new Set(['html', 'htm', 'svg', 'css', 'js', 'javascript', 'jsx', 'tsx', 'ts', 'typescript']);
  function isPreviewable(lang) {
    return PREVIEWABLE_LANGS.has(String(lang || '').toLowerCase());
  }

  function buildPreviewDoc(lang, code) {
    const l = String(lang || '').toLowerCase();

    if (l === 'html' || l === 'htm') {
      if (/<html[\s>]/i.test(code)) return code;
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#111;background:#fff;}</style>
        </head><body>${code}</body></html>`;
    }

    if (l === 'svg') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;background:
          repeating-conic-gradient(#f2f2f5 0% 25%, #fff 0% 50%) 50% / 24px 24px;}
          svg{max-width:92%;max-height:92%;}</style>
        </head><body>${code}</body></html>`;
    }

    if (l === 'css') {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${code}</style></head>
        <body style="font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111;background:#fff;">
        <p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">
          CSS preview — applied to sample elements below</p>
        <h1>Heading one</h1><h2>Heading two</h2>
        <p>A paragraph of body text with a <a href="#">link</a> inside it.</p>
        <button>Button</button> <button disabled>Disabled</button>
        <div class="card" style="margin-top:12px;"><p>A generic <code>.card</code> div, in case your CSS targets one.</p></div>
        <ul><li>List item one</li><li>List item two</li></ul>
        </body></html>`;
    }

    if (l === 'jsx' || l === 'tsx' || (l === 'ts' && /<[A-Za-z]/.test(code)) ) {
      return `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;background:#fff;}
          #locxy-root:empty::after{content:'(component rendered nothing)';color:#999;font-size:13px;}
          .locxy-err{white-space:pre-wrap;font-family:monospace;font-size:12.5px;color:#b3261e;background:#fdecea;
            border:1px solid #f2b8b5;border-radius:8px;padding:12px;}</style>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        </head><body>
        <div id="locxy-root"></div>
        <script type="text/babel" data-presets="react,typescript" data-type="module">
        try {
          ${code}
          const __candidates = [typeof App !== 'undefined' ? App : undefined,
            typeof exports !== 'undefined' ? exports.default : undefined,
            typeof module !== 'undefined' && module.exports ? module.exports.default || module.exports : undefined];
          const __Comp = __candidates.find(c => typeof c === 'function');
          const root = ReactDOM.createRoot(document.getElementById('locxy-root'));
          if (__Comp) root.render(React.createElement(__Comp));
          else root.render(React.createElement('div', {className:'locxy-err'}, 'No component found to render. Define a function/const named "App" or use "export default".'));
        } catch (err) {
          document.getElementById('locxy-root').innerHTML = '<div class="locxy-err">' + (err && err.message || String(err)).replace(/</g,'&lt;') + '</div>';
        }
        </script>
        </body></html>`;
    }

    // Plain JS/TS: run it and surface console output + uncaught errors visibly,
    // since there's no chat window to print to inside the sandboxed iframe.
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;background:#fff;}
        #locxy-console{font-family:monospace;font-size:12.5px;white-space:pre-wrap;line-height:1.6;}
        .locxy-log{color:#111;} .locxy-error{color:#b3261e;} .locxy-warn{color:#a15c00;}
        #locxy-tag{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;}</style>
      ${l.startsWith('ts') ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>' : ''}
      </head><body>
      <div id="locxy-tag">console output</div>
      <div id="locxy-console"></div>
      <script>
        const out = document.getElementById('locxy-console');
        function line(cls, args){ const d=document.createElement('div'); d.className=cls;
          d.textContent = args.map(a=>{try{return typeof a==='string'?a:JSON.stringify(a);}catch(e){return String(a);}}).join(' ');
          out.appendChild(d); }
        console.log = (...a) => line('locxy-log', a);
        console.warn = (...a) => line('locxy-warn', a);
        console.error = (...a) => line('locxy-error', a);
        window.onerror = (msg) => { line('locxy-error', ['Uncaught: ' + msg]); };
      </script>
      <script${l.startsWith('ts') ? ' type="text/babel" data-presets="typescript"' : ''}>
        ${code}
      </script>
      </body></html>`;
  }

  function buildCombinedPreviewDoc(blocks) {
    const isHtml = b => ['html', 'htm'].includes(String(b.lang || '').toLowerCase());
    const isCss = b => String(b.lang || '').toLowerCase() === 'css';
    const isJs = b => ['js', 'javascript'].includes(String(b.lang || '').toLowerCase());
    const htmlBlock = blocks.find(isHtml);
    const css = blocks.filter(isCss).map(b => b.code).join('\n\n');
    const js = blocks.filter(isJs).map(b => b.code).join('\n\n');

    let base = htmlBlock ? htmlBlock.code : '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>';
    if (!/<html[\s>]/i.test(base)) {
      base = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#111;background:#fff;}</style>
        </head><body>${base}</body></html>`;
    }
    if (css) {
      base = /<\/head>/i.test(base)
        ? base.replace(/<\/head>/i, `<style>${css}</style></head>`)
        : base.replace(/<body[^>]*>/i, (m) => `${m}<style>${css}</style>`);
    }
    if (js) {
      base = /<\/body>/i.test(base)
        ? base.replace(/<\/body>/i, `<script>${js}</script></body>`)
        : base + `<script>${js}</script>`;
    }
    return base;
  }

  function renderPreviewDoc() {
    if (!state.currentPreview) return;
    const doc = state.currentPreview.combo
      ? buildCombinedPreviewDoc(state.currentPreview.blocks)
      : buildPreviewDoc(state.currentPreview.lang, state.currentPreview.code);
    els.previewFrame.srcdoc = doc;
  }

  function openInPreview(lang, code) {
    state.currentPreview = { lang: lang || 'html', code, combo: false };
    els.previewEmpty.classList.add('hidden');
    els.previewWrap.classList.remove('hidden');
    els.previewLang.textContent = (lang || 'html') + ' · live';
    renderPreviewDoc();
    switchWorkspaceTab('preview');
    if (isOverlayPlan()) openPlanPanel(); else els.app.classList.add('plan-open');
    updateBackdrop();
  }

  function openInPreviewCombined(blocks) {
    state.currentPreview = { combo: true, blocks };
    els.previewEmpty.classList.add('hidden');
    els.previewWrap.classList.remove('hidden');
    const langs = [...new Set(blocks.map(b => (b.lang || 'text').toLowerCase()))];
    els.previewLang.textContent = `${langs.join('+')} · combined app`;
    renderPreviewDoc();
    switchWorkspaceTab('preview');
    if (isOverlayPlan()) openPlanPanel(); else els.app.classList.add('plan-open');
    updateBackdrop();
  }

  function popoutPreview() {
    if (!state.currentPreview) return;
    const doc = state.currentPreview.combo
      ? buildCombinedPreviewDoc(state.currentPreview.blocks)
      : buildPreviewDoc(state.currentPreview.lang, state.currentPreview.code);
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------- code viewer ----------
  function openInCodeViewer(lang, code) {
    const id = 'snip' + (++snippetSeq);
    state.codeSnippets.push({ id, lang: lang || 'text', code });
    if (state.codeSnippets.length > 8) state.codeSnippets.shift(); // cap history
    state.activeCodeId = id;
    renderCodeFileTabs();
    showCodeSnippet(id);
    switchWorkspaceTab('code');
    if (isOverlayPlan()) openPlanPanel(); else els.app.classList.add('plan-open');
    updateBackdrop();
  }

  function renderCodeFileTabs() {
    els.codeCount.textContent = state.codeSnippets.length;
    els.codeCount.classList.toggle('hidden', state.codeSnippets.length === 0);
    if (state.codeSnippets.length <= 1) {
      els.codeFileTabs.classList.add('hidden');
      els.codeFileTabs.innerHTML = '';
      return;
    }
    els.codeFileTabs.classList.remove('hidden');
    els.codeFileTabs.innerHTML = '';
    state.codeSnippets.forEach((s, i) => {
      const tab = document.createElement('button');
      tab.className = 'code-file-tab' + (s.id === state.activeCodeId ? ' active' : '');
      tab.textContent = `${s.lang || 'snippet'} ${i + 1}`;
      tab.addEventListener('click', () => { state.activeCodeId = s.id; renderCodeFileTabs(); showCodeSnippet(s.id); });
      els.codeFileTabs.appendChild(tab);
    });
  }

  function showCodeSnippet(id) {
    exitCodeEditMode();
    const snippet = state.codeSnippets.find(s => s.id === id);
    if (!snippet) {
      els.codeViewerEmpty.classList.remove('hidden');
      els.codeViewerWrap.classList.add('hidden');
      return;
    }
    els.codeViewerEmpty.classList.add('hidden');
    els.codeViewerWrap.classList.remove('hidden');
    els.codeViewerLang.textContent = snippet.lang || 'text';
    els.codeViewerCode.className = snippet.lang ? `language-${snippet.lang}` : '';
    els.codeViewerCode.textContent = snippet.code;
    try { hljs.highlightElement(els.codeViewerCode); } catch {}
    els.codePreviewBtn.classList.toggle('hidden', !isPreviewable(snippet.lang));
  }

  // ---------- live-editable canvas ----------
  // Turns the read-only code viewer into a real editable artifact, the way
  // ChatGPT's Canvas / Claude's Artifacts let you tweak generated code
  // directly: edit, re-run the live preview against YOUR version, or hand
  // the edited version back to the model to continue from.
  function enterCodeEditMode() {
    const s = currentSnippet();
    if (!s) return;
    state.editingCode = true;
    els.codeEditArea.value = Object.prototype.hasOwnProperty.call(state.codeEdits, s.id) ? state.codeEdits[s.id] : s.code;
    els.codeEditArea.classList.remove('hidden');
    els.codeEditBar.classList.remove('hidden');
    els.codeViewerCode.closest('.code-viewer-pre').classList.add('hidden');
    els.codeEditBtn.textContent = '👁 View';
    els.codeEditArea.focus();
  }
  function exitCodeEditMode() {
    state.editingCode = false;
    els.codeEditArea.classList.add('hidden');
    els.codeEditBar.classList.add('hidden');
    const pre = els.codeViewerCode.closest('.code-viewer-pre');
    if (pre) pre.classList.remove('hidden');
    els.codeEditBtn.textContent = '✎ Edit';
  }

  function currentSnippet() {
    return state.codeSnippets.find(s => s.id === state.activeCodeId);
  }

  // ---------- plan panel (agent trace) ----------
  function clearPlanPanel() {
    els.planBody.innerHTML = '<p class="plan-empty">When agentic planning is on, each response\'s plan and steps will appear here as Coctus works.</p>';
    setStatus('');
  }

  // Resets the ENTIRE workspace panel — trace, code snippets, live preview,
  // and the project file view — and switches back to the trace tab. Used on
  // New Chat / switching sessions: previously only the trace/plan tab was
  // reset, so the Code tab's snippet history, an open live preview, and an
  // open project file could all silently carry over from a completely
  // different conversation.
  function resetWorkspacePanel() {
    clearPlanPanel();
    state.codeSnippets = [];
    state.activeCodeId = null;
    state.codeEdits = {};
    state.editingCode = false;
    state.currentPreview = null;
    renderCodeFileTabs();
    els.codeViewerWrap.classList.add('hidden');
    els.codeViewerEmpty.classList.remove('hidden');
    els.previewWrap.classList.add('hidden');
    els.previewEmpty.classList.remove('hidden');
    closeProjectFile();
    LocxyWorkspace.clear();
    renderProjectPanel();
    switchWorkspaceTab('trace');
  }

  function renderPlan(plan) {
    if (!plan) { clearPlanPanel(); return; }
    const block = document.createElement('div');
    block.className = 'plan-block';
    block.id = 'currentPlanBlock';
    block.innerHTML = `<div class="plan-goal">${escapeHtml(plan.goal || '')}</div>`;
    plan.steps.forEach((step, i) => {
      const el = document.createElement('div');
      el.className = 'plan-step';
      el.id = `plan-step-${i}`;
      el.innerHTML = `<b>${escapeHtml(step.title)}</b>${escapeHtml(step.detail || '')}<div class="plan-step-note" id="plan-step-note-${i}"></div>`;
      block.appendChild(el);
    });
    els.planBody.innerHTML = '';
    els.planBody.appendChild(block);
    els.planPanel.scrollTop = 0;
  }

  function markStep(i, status) {
    const el = document.getElementById(`plan-step-${i}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (status) el.classList.add(status);
    if (status === 'active') {
      const note = document.getElementById(`plan-step-note-${i}`);
      if (note) note.textContent = '';
    }
  }

  // Live-updates a step's working text as it streams in — this is what
  // makes the trace panel show Coctus's actual thinking as it happens,
  // rather than only the final note once a step is fully done.
  function updateStepNote(i, full) {
    const note = document.getElementById(`plan-step-note-${i}`);
    if (!note) return;
    note.textContent = full;
    els.planPanel.scrollTop = els.planPanel.scrollHeight;
  }

  function addRoundNote(label, detail) {
    const div = document.createElement('div');
    div.className = 'plan-round';
    div.textContent = label;
    els.planBody.appendChild(div);
    if (detail) {
      const step = document.createElement('div');
      step.className = 'plan-step active';
      step.innerHTML = `<b>${escapeHtml(detail)}</b>`;
      els.planBody.appendChild(step);
    }
    els.planPanel.scrollTop = els.planPanel.scrollHeight;
  }

  const toastStack = document.getElementById('toastStack');
  function showToast(message, kind = 'info', durationMs = 5000) {
    if (!toastStack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind !== 'info' ? ` ${kind}` : '');
    el.textContent = message;
    toastStack.appendChild(el);
    const remove = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    setTimeout(remove, durationMs);
    el.addEventListener('click', remove);
  }

  function setStatus(text) {
    els.topbarStatus.textContent = text || '';
  }

  const TOOL_ICONS = { web_fetch: '🌐', calculator: '🧮', js_exec: '⚙️', py_exec: '🐍' };
  let pendingToolDiv = null;
  function renderToolCall(call, result) {
    const icon = TOOL_ICONS[call.tool] || '🔧';
    const argStr = call.args ? Object.entries(call.args).map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`).join(', ') : '';
    if (!result) {
      const div = document.createElement('div');
      div.className = 'plan-round tool-call tool-pending';
      div.textContent = `${icon} Calling ${call.tool}(${argStr})…`;
      els.planBody.appendChild(div);
      pendingToolDiv = div;
    } else {
      const div = pendingToolDiv || document.createElement('div');
      if (!pendingToolDiv) els.planBody.appendChild(div);
      div.className = 'plan-round tool-call ' + (result.ok ? 'tool-ok' : 'tool-err');
      div.textContent = result.ok
        ? `${icon} ${call.tool}(${argStr}) → ${String(result.result || '').slice(0, 140)}`
        : `${icon} ${call.tool}(${argStr}) failed: ${result.error || ''}`;
      pendingToolDiv = null;
    }
    els.planPanel.scrollTop = els.planPanel.scrollHeight;
  }

  // ---------- sending ----------
  async function handleSend(e) {
    e.preventDefault();
    if (state.generating || state.attachments.some(a => a.kind === 'loading')) return;
    const text = els.composerInput.value.trim();
    const pendingAttachments = state.attachments.filter(a => a.kind !== 'loading');
    if (!text && !pendingAttachments.length) return;
    if (navigator.onLine === false) {
      showToast("You're offline — reconnect and try again.", 'error', 6000);
      return;
    }

    let fullUserText = text;
    const imageBlocks = [];
    const displayImages = [];
    for (const att of pendingAttachments) {
      if (att.kind === 'image') {
        imageBlocks.push({ type: 'image_url', image_url: { url: att.dataUrl } });
        displayImages.push({ name: att.name, dataUrl: att.dataUrl });
      } else if (att.kind === 'text') {
        fullUserText += `\n\n[Attached file: ${att.name}]\n\`\`\`\n${att.text}\n\`\`\``;
      } else {
        fullUserText += `\n\n[Attached file: ${att.name} (${att.mime || 'unknown type'}, ${formatBytes(att.size)}) — binary file, contents not extracted]`;
      }
    }
    if (!text && pendingAttachments.length) fullUserText = fullUserText.trim() || 'Please look at the attached file(s).';

    const userContent = imageBlocks.length
      ? [{ type: 'text', text: fullUserText }, ...imageBlocks]
      : fullUserText;

    LocxyMemory.autoExtract(text);

    if (state.session.messages.length === 0) {
      state.session.title = (text || pendingAttachments[0]?.name || 'Untitled').slice(0, 48) + ((text || '').length > 48 ? '…' : '');
    }
    const userMsg = { role: 'user', content: fullUserText };
    if (displayImages.length) userMsg.images = displayImages;
    state.session.messages.push(userMsg);
    state.session.model = els.modelSelect.value;
    LocxyMemory.saveSession(state.session);
    renderSessionList();
    els.sessionTitle.textContent = state.session.title;

    appendMessageEl('user', fullUserText, true, null, displayImages);
    els.composerInput.value = '';
    clearAttachments();
    autoResizeTextarea();
    setGenerating(true);
    clearPlanPanel();

    const model = els.modelSelect.value;
    const useHybrid = els.hybridToggle.checked && els.execModelSelect.value && !els.execModelSelect.disabled;
    const execModel = useHybrid ? els.execModelSelect.value : null;
    const execProvider = null; // same provider as the main model — hybrid now means "two models", not "two providers"
    const agentic = els.agentToggle.checked;
    const research = els.researchToggle.checked;
    const runToCompletion = els.completionToggle.checked;
    const tools = els.toolsToggle.checked;
    const deepResearch = els.deepResearchToggle.checked;
    const teamMode = els.teamToggle.checked;
    const showThinking = els.thinkingToggle.checked;
    const liveSearch = research && LocxyModels.supportsWebSearch(model);
    const persona = getPersona();
    const criticModel = els.criticSelect.value || null;
    const provider = LocxyModels.getProvider();
    const modelPrefKey = provider === LocxyModels.PROVIDERS.OPENROUTER ? 'openrouterModel' : 'model';
    LocxyMemory.savePrefs({ ...LocxyMemory.getPrefs(), [modelPrefKey]: model, agentic, research, runToCompletion, tools, criticModel, deepResearch, teamMode, showThinking });

    setStatus('Recalling context…');
    const history = await LocxyMemory.getConversationContext(state.session, model, LocxyModels.chat);
    const facts = LocxyMemory.factsAsSystemContext();
    const profileCtx = LocxyMemory.profileAsSystemContext();
    const recalled = LocxyMemory.recallContext(text, state.session.id);
    let systemPreamble = `You are Coctus AI, an agentic assistant embedded in a single-page web app. You are direct, precise, and helpful across coding, research, writing, and general reasoning. Format responses in clean markdown; use fenced code blocks with a language tag for any code. When a task has multiple parts (e.g. several files, a multi-section document), write all of them out in full — never summarize or promise to add the rest "later".`;
    systemPreamble += persona.prompt;
    if (liveSearch) {
      systemPreamble += `\nWeb search is available to you for this turn — use it for anything time-sensitive or where current facts matter, and note when a claim comes from a live search result.`;
    } else if (research) {
      systemPreamble += `\nThe user asked for web-aware answers, but the selected model doesn't have live search wired up here (currently only OpenAI-family models do) — be explicit about your knowledge cutoff and flag anything that may have changed since, rather than asserting current facts with false confidence.`;
    }
    if (profileCtx) systemPreamble += `\n\n${profileCtx}`;
    if (facts) systemPreamble += `\n\n${facts}`;
    if (recalled) systemPreamble += `\n\n${recalled}`;

    const badge = teamMode ? '👥 team' : deepResearch ? '🔬 deep research' : (liveSearch ? '🔎 web search' : null);

    els.typingIndicator.classList.remove('hidden');
    setStatus(teamMode ? 'Assembling team…' : agentic ? 'Planning…' : 'Thinking…');
    scrollToBottom();

    let contentEl = null;
    let streamed = '';
    state.signal = { cancelled: false };

    // Live-updates the visible bubble from a raw (possibly thinking-tagged) buffer.
    function paintStream(full) {
      streamed = full;
      const parsed = splitThinking(full);
      if (parsed.tagged) {
        if (parsed.thinking) setThinking(contentEl, parsed.thinking);
        contentEl.innerHTML = renderMarkdown(parsed.answer);
      } else {
        contentEl.innerHTML = renderMarkdown(full);
      }
      decorateCodeBlocks(contentEl, contentEl.parentElement);
      scrollToBottom();
    }

    const PHASE_LABELS = { discuss: '💬 Discussing', plan: '🗺️ Planning', execute: '⚙️ Executing', review: '🔍 Reviewing' };
    const callbacks = {
      onPhase: (phase, detail) => {
        const label = PHASE_LABELS[phase] || phase;
        if (phase === 'execute' && detail && detail.provider) {
          setStatus(`${label} (local: ${detail.model})…`);
        } else if (phase === 'discuss' && typeof detail === 'string' && detail) {
          addRoundNote('Discussing', detail);
          setStatus(`${label}…`);
        } else {
          setStatus(`${label}…`);
        }
      },
      onPlan: (plan) => { renderPlan(plan); setStatus(plan ? 'Working through plan…' : 'Writing…'); },
      onStepStart: (i) => markStep(i, 'active'),
      onStepDone: (i) => markStep(i, 'done'),
      onStepToken: (i, chunk, full) => updateStepNote(i, full),
      onRound: (n, reason) => { addRoundNote(`Continuing — round ${n}`, reason); setStatus(`Continuing (round ${n})…`); },
      onNote: (note) => { addRoundNote('Verifying', note); setStatus('Verifying…'); },
      onToolCall: (call, result) => {
        renderToolCall(call, result);
        setStatus(result ? 'Writing…' : `Using ${call.tool}…`);
        if (result && result.ok && (call.tool === 'write_file' || call.tool === 'read_file')) {
          els.projectCount.textContent = String(LocxyWorkspace.fileCount());
          els.projectCount.classList.toggle('hidden', LocxyWorkspace.isEmpty());
          if (!els.projectBody.classList.contains('hidden')) renderProjectPanel();
        }
      },
      onToken: (chunk, full) => {
        if (!contentEl) {
          els.typingIndicator.classList.add('hidden');
          contentEl = appendMessageEl('assistant', '', true, badge);
          setStatus('Writing…');
        }
        paintStream(full);
      },
    };

    try {
      const final = teamMode
        ? await LocxyAgent.runTeam({ history, userText: fullUserText, userContent, model, execModel, execProvider, systemPreamble, webSearch: liveSearch, tools, signal: state.signal, callbacks })
        : await LocxyAgent.run({
            history, userText: fullUserText, userContent, model, execModel, execProvider, systemPreamble, agentic, webSearch: liveSearch, runToCompletion,
            tools, criticModel, temperature: persona.temp, deepResearch, showThinking, signal: state.signal, callbacks,
          });

      const rawFinal = streamed || final || '';
      const parsedFinal = splitThinking(rawFinal);
      const answerOnly = parsedFinal.tagged ? parsedFinal.answer : rawFinal;
      const thinkingOnly = parsedFinal.tagged ? parsedFinal.thinking : '';

      if (!contentEl) {
        els.typingIndicator.classList.add('hidden');
        contentEl = appendMessageEl('assistant', answerOnly, true, badge);
      } else if (rawFinal !== streamed || parsedFinal.tagged) {
        contentEl.innerHTML = renderMarkdown(answerOnly);
        decorateCodeBlocks(contentEl, contentEl.parentElement);
      }
      if (thinkingOnly) setThinking(contentEl, thinkingOnly);
      contentEl.dataset.raw = answerOnly;

      const savedMsg = { role: 'assistant', content: answerOnly };
      if (thinkingOnly) savedMsg.thinking = thinkingOnly;
      state.session.messages.push(savedMsg);
      LocxyMemory.saveSession(state.session);
    } catch (err) {
      els.typingIndicator.classList.add('hidden');
      if (err instanceof LocxyModels.CancelledError) {
        const parsedPartial = splitThinking(streamed.trim());
        const partial = parsedPartial.tagged ? parsedPartial.answer.trim() : streamed.trim();
        if (contentEl && partial) {
          contentEl.dataset.raw = partial;
          addRoundNote('Stopped', 'Generation was stopped before it finished.');
          const savedMsg = { role: 'assistant', content: partial };
          if (parsedPartial.tagged && parsedPartial.thinking) savedMsg.thinking = parsedPartial.thinking;
          state.session.messages.push(savedMsg);
          LocxyMemory.saveSession(state.session);
        } else if (!contentEl) {
          appendMessageEl('assistant', '_Stopped before generating a response._');
        }
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

  // Builds an accurate, actionable error message for the active provider —
  // the old version always said "check that you're signed in with Puter",
  // which was flatly wrong whenever the failure was actually on OpenRouter
  // or a rate limit, and gave the user nothing useful to act on.
  function buildErrorMessage(err) {
    const msg = String(err && err.message || err || 'Unknown error');
    const provider = LocxyModels.getProvider();
    const lower = msg.toLowerCase();

    if (/rate.?limit|429/.test(lower)) {
      return `Rate limited: ${msg}\n\nOpenRouter's free tier is 20 requests/min, 50/day (1000/day once you've ever added $10+ in credits). Wait a bit, switch to a different free model, or add another key for automatic rotation.`;
    }
    if (provider === LocxyModels.PROVIDERS.OPENROUTER && (/no openrouter api key/i.test(msg) || !LocxyModels.openRouterKeyPresent())) {
      return `${msg}\n\nAdd a key in the sidebar's OpenRouter key field, or in key.js for a local-only copy.`;
    }
    if (provider === LocxyModels.PROVIDERS.OPENROUTER) {
      return `Something went wrong reaching OpenRouter: ${msg}\n\nCheck your connection and the key status in the sidebar, then try again. If this keeps happening, try a different model from the list — free models occasionally go down individually.`;
    }
    return `Something went wrong reaching the model: ${msg}\n\nCheck that you're signed in with Puter (top of the sidebar) and try again.`;
  }

  function stopGenerating() {
    if (state.signal) state.signal.cancelled = true;
  }

  function setGenerating(on) {
    state.generating = on;
    updateSendEnabled();
    els.app.classList.toggle('generating', on);
    els.sendBtn.classList.toggle('hidden', on);
    els.stopBtn.classList.toggle('hidden', !on);
  }

  function updateSendEnabled() {
    els.sendBtn.disabled = state.generating || state.attachments.some(a => a.kind === 'loading');
  }

  // ---------- attachments ----------
  const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB — generous for docs/images, guards against someone dropping in a video or a zip

  async function handleFileAttach(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    els.fileAttach.value = ''; // allow re-selecting the same file later

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast(`"${file.name}" is ${formatBytes(file.size)} — over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit, so it wasn't attached. Large files blow past what a model can actually read anyway.`, 'error', 7000);
        continue;
      }
      const placeholder = { name: file.name, mime: file.type, size: file.size, kind: 'loading' };
      state.attachments.push(placeholder);
      renderAttachPreview();
      const processed = await LocxyFiles.process(file);
      const idx = state.attachments.indexOf(placeholder);
      if (idx !== -1) state.attachments[idx] = processed;
      renderAttachPreview();
    }
  }

  function removeAttachment(att) {
    state.attachments = state.attachments.filter(a => a !== att);
    renderAttachPreview();
  }

  function clearAttachments() {
    state.attachments = [];
    renderAttachPreview();
  }

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
      const chip = document.createElement('div');
      chip.className = 'attach-chip';
      const icon = att.kind === 'loading' ? '⏳' : att.kind === 'image' ? '🖼️' : att.kind === 'unsupported' ? '📦' : '📄';
      chip.innerHTML = `<span class="attach-chip-icon">${icon}</span><span class="attach-chip-name">${escapeHtml(att.name)}</span><span class="attach-chip-size">${formatBytes(att.size)}</span>`;
      const btn = document.createElement('button');
      btn.textContent = '✕';
      btn.addEventListener('click', () => removeAttachment(att));
      chip.appendChild(btn);
      els.attachPreview.appendChild(chip);
    });
  }

  // ---------- memory modal ----------
  function renderMemoryList() {
    const facts = LocxyMemory.getFacts();
    els.memoryList.innerHTML = '';
    if (!facts.length) {
      els.memoryList.innerHTML = '<p class="memory-empty">No saved facts yet. Mention something worth remembering in chat, or add one below.</p>';
      return;
    }
    facts.forEach(f => {
      const item = document.createElement('div');
      item.className = 'memory-item' + (f.pinned ? ' pinned' : '');

      const text = document.createElement('span');
      text.textContent = f.text;
      text.title = 'Click to edit';
      text.className = 'memory-text';
      text.addEventListener('click', () => {
        const next = prompt('Edit fact:', f.text);
        if (next !== null && next.trim()) { LocxyMemory.editFact(f.id, next); renderMemoryList(); }
      });
      item.appendChild(text);

      const pin = document.createElement('button');
      pin.textContent = f.pinned ? '📌' : '📍';
      pin.title = f.pinned ? 'Pinned — always included, click to unpin' : 'Pin — always include this fact';
      pin.addEventListener('click', () => { LocxyMemory.togglePinFact(f.id); renderMemoryList(); });
      item.appendChild(pin);

      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Delete';
      del.addEventListener('click', () => { LocxyMemory.removeFact(f.id); renderMemoryList(); });
      item.appendChild(del);

      els.memoryList.appendChild(item);
    });
  }

  // ---------- theme ----------
  const THEME_KEY = 'locxy_theme_v1';
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') html.setAttribute('data-theme', 'dark');
    else html.removeAttribute('data-theme');
    const dark = document.getElementById('hljsDark');
    const light = document.getElementById('hljsLight');
    if (dark && light) { dark.disabled = theme === 'light'; light.disabled = theme !== 'light'; }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#171615' : '#B5502C');
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }

  // Installable, app-shell-offline PWA feel — non-fatal if unsupported (e.g. file:// or an older browser).
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Coctus: service worker registration failed', err));
  }

  // ---------- misc helpers ----------
  function autoResizeTextarea() {
    els.composerInput.style.height = 'auto';
    els.composerInput.style.height = Math.min(els.composerInput.scrollHeight, 200) + 'px';
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeName(s) {
    return (s || 'snippet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'snippet';
  }

  // ---------- events ----------
  function bindEvents() {
    els.composerForm.addEventListener('submit', handleSend);
    els.stopBtn.addEventListener('click', stopGenerating);
    els.composerInput.addEventListener('input', autoResizeTextarea);
    els.composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); els.composerForm.requestSubmit(); }
    });
    els.newChatBtn.addEventListener('click', newSession);
    els.authBtn.addEventListener('click', handleAuthClick);
    els.fileAttach.addEventListener('change', handleFileAttach);

    els.toggleSidebar.addEventListener('click', toggleSidebarDrawer);
    els.closeSidebar.addEventListener('click', closeSidebarDrawer);
    els.togglePlan.addEventListener('click', togglePlanPanel);
    els.closePlan.addEventListener('click', closePlanPanel);
    els.backdrop.addEventListener('click', () => { closeSidebarDrawer(); closePlanPanel(); });
    window.addEventListener('resize', updateBackdrop);

    els.tabTrace.addEventListener('click', () => switchWorkspaceTab('trace'));
    els.tabProject.addEventListener('click', () => switchWorkspaceTab('project'));
    els.tabCode.addEventListener('click', () => switchWorkspaceTab('code'));
    els.tabPreview.addEventListener('click', () => switchWorkspaceTab('preview'));
    els.codePreviewBtn.addEventListener('click', () => {
      const s = currentSnippet();
      if (s) openInPreview(s.lang, s.code);
    });
    els.previewRefreshBtn.addEventListener('click', renderPreviewDoc);
    els.previewPopoutBtn.addEventListener('click', popoutPreview);
    els.themeToggle.addEventListener('click', toggleTheme);
    els.codeCopyBtn.addEventListener('click', () => {
      const s = currentSnippet();
      if (!s) return;
      const code = state.editingCode && Object.prototype.hasOwnProperty.call(state.codeEdits, s.id) ? state.codeEdits[s.id] : s.code;
      navigator.clipboard.writeText(code)
        .then(() => showToast('Copied to clipboard.'))
        .catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
    });
    els.codeDownloadBtn.addEventListener('click', () => {
      const s = currentSnippet();
      if (!s) return;
      const ext = LocxyDocuments.extFor(s.lang);
      const code = state.editingCode && Object.prototype.hasOwnProperty.call(state.codeEdits, s.id) ? state.codeEdits[s.id] : s.code;
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `locxy-snippet.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    els.projectDownloadZipBtn.addEventListener('click', async () => {
      if (LocxyWorkspace.isEmpty()) return;
      try {
        const blob = await LocxyWorkspace.exportZip();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `coctus-project-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (err) {
        showToast(`Could not build the .zip: ${err.message}`, 'error');
      }
    });
    els.projectClearBtn.addEventListener('click', () => {
      if (LocxyWorkspace.isEmpty()) return;
      if (!confirm(`Clear all ${LocxyWorkspace.fileCount()} file(s) from the project workspace? This can't be undone (download the .zip first if you want to keep it).`)) return;
      LocxyWorkspace.clear();
      closeProjectFile();
      renderProjectPanel();
    });
    els.projectFileBackBtn.addEventListener('click', closeProjectFile);
    els.projectFileCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(els.projectFileCode.textContent)
        .then(() => showToast('Copied to clipboard.'))
        .catch(() => showToast('Could not copy — your browser blocked clipboard access.', 'error'));
    });
    els.projectFileDownloadBtn.addEventListener('click', () => {
      const path = els.projectFilePath.textContent;
      const content = LocxyWorkspace.readFile(path);
      if (content === null) return;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = path.split('/').pop() || 'file.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    els.codeEditBtn.addEventListener('click', () => {
      state.editingCode ? exitCodeEditMode() : enterCodeEditMode();
    });
    els.codeEditArea.addEventListener('input', () => {
      const s = currentSnippet();
      if (s) state.codeEdits[s.id] = els.codeEditArea.value;
    });
    els.codeEditRunBtn.addEventListener('click', () => {
      const s = currentSnippet();
      if (!s) return;
      openInPreview(s.lang, els.codeEditArea.value);
      switchWorkspaceTab('preview');
    });
    els.codeEditAskBtn.addEventListener('click', () => {
      const s = currentSnippet();
      if (!s) return;
      const code = els.codeEditArea.value;
      els.composerInput.value = `I edited this ${s.lang || ''} code myself — please continue from this exact version, don't revert my changes:\n\n\`\`\`${s.lang || ''}\n${code}\n\`\`\`\n\n`;
      autoResizeTextarea();
      els.composerInput.focus();
      if (isMobile() || isOverlayPlan()) closePlanPanel();
    });

    els.modelSelect.addEventListener('change', () => {
      state.session.model = els.modelSelect.value;
      LocxyMemory.saveSession(state.session);
      const prefs = LocxyMemory.getPrefs(); prefs.model = els.modelSelect.value; LocxyMemory.savePrefs(prefs);
    });
    els.agentToggle.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.agentic = els.agentToggle.checked; LocxyMemory.savePrefs(prefs);
    });
    els.researchToggle.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.research = els.researchToggle.checked; LocxyMemory.savePrefs(prefs);
    });
    els.completionToggle.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.runToCompletion = els.completionToggle.checked; LocxyMemory.savePrefs(prefs);
    });
    els.toolsToggle.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.tools = els.toolsToggle.checked; LocxyMemory.savePrefs(prefs);
    });
    els.thinkingToggle.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.showThinking = els.thinkingToggle.checked; LocxyMemory.savePrefs(prefs);
    });
    els.hybridToggle.addEventListener('change', async () => {
      els.execModelSelect.classList.toggle('hidden', !els.hybridToggle.checked);
      const prefs = LocxyMemory.getPrefs(); prefs.hybridExec = els.hybridToggle.checked; LocxyMemory.savePrefs(prefs);
      if (els.hybridToggle.checked) await populateExecModels(prefs.execModel);
    });
    els.execModelSelect.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.execModel = els.execModelSelect.value; LocxyMemory.savePrefs(prefs);
    });
    els.deepResearchToggle.addEventListener('change', () => {
      if (els.deepResearchToggle.checked && els.teamToggle.checked) els.teamToggle.checked = false;
      const prefs = LocxyMemory.getPrefs();
      prefs.deepResearch = els.deepResearchToggle.checked; prefs.teamMode = els.teamToggle.checked;
      LocxyMemory.savePrefs(prefs);
    });
    els.teamToggle.addEventListener('change', () => {
      if (els.teamToggle.checked && els.deepResearchToggle.checked) els.deepResearchToggle.checked = false;
      const prefs = LocxyMemory.getPrefs();
      prefs.teamMode = els.teamToggle.checked; prefs.deepResearch = els.deepResearchToggle.checked;
      LocxyMemory.savePrefs(prefs);
    });
    els.criticSelect.addEventListener('change', () => {
      const prefs = LocxyMemory.getPrefs(); prefs.criticModel = els.criticSelect.value || null; LocxyMemory.savePrefs(prefs);
    });
    els.personaRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.persona-chip');
      if (!chip) return;
      setActivePersonaChip(chip.dataset.persona);
      const prefs = LocxyMemory.getPrefs(); prefs.persona = chip.dataset.persona; LocxyMemory.savePrefs(prefs);
    });
    els.openrouterKeySaveBtn.addEventListener('click', async () => {
      const val = els.openrouterKeyInput.value.trim();
      if (!val) return;
      const existing = LocxyModels.getLocalOpenRouterKeys();
      LocxyModels.setLocalOpenRouterKeys([...existing, val]);
      els.openrouterKeyInput.value = '';
      await populateModels();
    });
    els.providerRow.addEventListener('click', async (e) => {
      const chip = e.target.closest('.persona-chip');
      if (!chip || !chip.dataset.provider) return;
      const map = {
        openrouter: LocxyModels.PROVIDERS.OPENROUTER,
        puter: LocxyModels.PROVIDERS.PUTER,
      };
      const p = map[chip.dataset.provider] || LocxyModels.PROVIDERS.PUTER;
      if (p === LocxyModels.getProvider()) return;
      LocxyModels.setProvider(p);
      setActiveProviderChip(p);
      const prefs = LocxyMemory.getPrefs(); prefs.provider = p; LocxyMemory.savePrefs(prefs);
      els.modelSelect.innerHTML = '<option>Loading models…</option>';
      await populateModels();
    });
    els.sessionSearch.addEventListener('input', renderSessionList);

    // ---------- voice input (Web Speech API) ----------
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;
    let listening = false;
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
    } else {
      els.micBtn.disabled = true;
      els.micBtn.title = 'Voice input needs browser speech recognition support (not available here)';
    }

    // ---------- profile ----------
    els.profileSaveBtn.addEventListener('click', () => {
      LocxyMemory.saveProfile({ name: els.profileName.value.trim(), role: els.profileRole.value.trim(), preferences: els.profilePrefs.value.trim() });
      els.profileSaveBtn.textContent = 'Saved ✓';
      setTimeout(() => (els.profileSaveBtn.textContent = 'Save profile'), 1200);
    });

    // ---------- backup export/import ----------
    els.backupExportBtn.addEventListener('click', () => {
      const json = LocxyMemory.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `locxy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    els.backupImportInput.addEventListener('change', async () => {
      const file = els.backupImportInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const { importedSessions, importedFacts } = LocxyMemory.importBackup(text);
        alert(`Imported ${importedSessions} session(s) and ${importedFacts} fact(s).`);
        renderSessionList();
        renderMemoryList();
        const profile = LocxyMemory.getProfile();
        els.profileName.value = profile.name || '';
        els.profileRole.value = profile.role || '';
        els.profilePrefs.value = profile.preferences || '';
      } catch (err) {
        alert('Could not import that file: ' + err.message);
      } finally {
        els.backupImportInput.value = '';
      }
    });

    // ---------- command palette ----------
    function paletteCommands() {
      const cmds = [
        { label: 'New session', run: newSession },
        { label: 'Toggle theme', run: toggleTheme },
        { label: 'Open memory', run: () => { renderMemoryList(); els.memoryModal.classList.remove('hidden'); } },
        { label: 'Export session…', run: () => els.exportModal.classList.remove('hidden') },
        { label: 'Toggle agentic planning', run: () => { els.agentToggle.checked = !els.agentToggle.checked; els.agentToggle.dispatchEvent(new Event('change')); } },
        { label: 'Toggle web search', run: () => { els.researchToggle.checked = !els.researchToggle.checked; els.researchToggle.dispatchEvent(new Event('change')); } },
        { label: 'Toggle tools', run: () => { els.toolsToggle.checked = !els.toolsToggle.checked; els.toolsToggle.dispatchEvent(new Event('change')); } },
        { label: 'Toggle run to completion', run: () => { els.completionToggle.checked = !els.completionToggle.checked; els.completionToggle.dispatchEvent(new Event('change')); } },
        { label: 'Clear all data…', run: () => els.clearBtn.click() },
      ];
      Object.entries(PERSONAS).forEach(([id, p]) => {
        cmds.push({ label: `Switch to ${p.label} mode`, run: () => { setActivePersonaChip(id); const prefs = LocxyMemory.getPrefs(); prefs.persona = id; LocxyMemory.savePrefs(prefs); } });
      });
      LocxyMemory.getSessions().slice(0, 30).forEach(s => {
        cmds.push({ label: `Open session: ${s.title}`, run: () => switchSession(s.id) });
      });
      return cmds;
    }
    function renderPalette(query) {
      const q = (query || '').toLowerCase();
      const matches = paletteCommands().filter(c => c.label.toLowerCase().includes(q)).slice(0, 12);
      els.paletteResults.innerHTML = '';
      if (!matches.length) {
        els.paletteResults.innerHTML = '<div class="palette-empty">No matching commands</div>';
        return;
      }
      matches.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'palette-row' + (i === 0 ? ' active' : '');
        row.textContent = c.label;
        row.addEventListener('click', () => { c.run(); closePalette(); });
        els.paletteResults.appendChild(row);
      });
    }
    function openPalette() {
      openModal(els.paletteModal, els.paletteInput);
      els.paletteInput.value = '';
      renderPalette('');
    }
    function closePalette() { closeModal(els.paletteModal); }
    els.paletteBtn.addEventListener('click', openPalette);
    els.paletteInput.addEventListener('input', () => renderPalette(els.paletteInput.value));
    els.paletteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = els.paletteResults.querySelector('.palette-row');
        if (first) first.click();
      }
    });
    els.paletteModal.addEventListener('click', (e) => { if (e.target === els.paletteModal) closePalette(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        els.paletteModal.classList.contains('hidden') ? openPalette() : closePalette();
      }
    });

    // Reusable open/close for modal dialogs: moves focus INTO the dialog on
    // open (first focusable element) and back to whatever triggered it on
    // close — keyboard/screen-reader users otherwise lose their place
    // entirely when a modal appears over the page.
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
      return [els.paletteModal, els.memoryModal, els.exportModal].find(m => !m.classList.contains('hidden'));
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = topmostOpenModal();
      if (open) closeModal(open);
    });

    els.memoryBtn.addEventListener('click', () => { renderMemoryList(); openModal(els.memoryModal); });
    els.closeMemory.addEventListener('click', () => closeModal(els.memoryModal));
    els.memoryAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = els.memoryAddInput.value.trim();
      if (v) { LocxyMemory.addFact(v); els.memoryAddInput.value = ''; renderMemoryList(); }
    });

    els.exportBtn.addEventListener('click', () => openModal(els.exportModal));
    els.closeExport.addEventListener('click', () => closeModal(els.exportModal));
    els.exportModal.querySelectorAll('.export-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        LocxyDocuments.exportSession(state.session, btn.dataset.format);
        closeModal(els.exportModal);
      });
    });

    els.clearBtn.addEventListener('click', () => {
      if (!confirm('Clear all sessions and saved memory on this device? This cannot be undone.')) return;
      LocxyMemory.clearAll();
      state.session = LocxyMemory.createSession();
      renderSessionList();
      renderMessages();
      clearPlanPanel();
    });

    [els.memoryModal, els.exportModal].forEach(modal => {
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });
  }

  init();
})();
