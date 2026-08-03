(() => {
  const existing = window.__SCROLLER_KEYFRAMES__;
  if (existing) {
    existing.toggle();
    return;
  }

  const STORAGE_PREFIX = "scroller-timeline:";
  const root = document.createElement("div");
  root.id = "scroller-extension-root";
  const shadow = root.attachShadow({ mode: "open" });
  document.documentElement.appendChild(root);

  let state = {
    frames: [],
    loop: true,
    countdown: 3,
    hideWhilePlaying: true
  };
  let selectedId = null;
  let isPlaying = false;
  let playbackToken = 0;
  let status = "Ready";
  let saveTimer = null;
  let dragId = null;
  let minimized = false;
  let panelPosition = null;

  const storageKey = `${STORAGE_PREFIX}${location.origin}${location.pathname}`;

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      --sc-accent: #ff6658;
      --sc-accent-soft: rgba(255, 102, 88, 0.12);
      --sc-bg: #151719;
      --sc-surface: #1d2023;
      --sc-surface-hover: #24272a;
      --sc-border: rgba(255, 255, 255, 0.12);
      --sc-text: #f7f5f2;
      --sc-muted: #9b9b9a;
      color-scheme: dark;
    }

    * { box-sizing: border-box; }
    button, input, select { font: inherit; }

    .panel {
      position: fixed;
      z-index: 2147483647;
      right: 20px;
      bottom: 20px;
      width: min(390px, calc(100vw - 24px));
      max-height: min(680px, calc(100vh - 24px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--sc-text);
      background: rgba(21, 23, 25, 0.985);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38), 0 4px 14px rgba(0, 0, 0, 0.22);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.35;
      letter-spacing: 0;
      -webkit-font-smoothing: antialiased;
    }

    .panel.minimized .panel-body,
    .panel.minimized .footer { display: none; }

    .panel.recording-hidden { display: none; }

    .header {
      min-height: 54px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 12px 0 16px;
      border-bottom: 1px solid var(--sc-border);
      cursor: grab;
      user-select: none;
    }

    .header:active { cursor: grabbing; }
    .brand { font-size: 16px; font-weight: 680; letter-spacing: -0.02em; }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin-right: auto;
      color: var(--sc-muted);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status::before {
      content: "";
      width: 6px;
      height: 6px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: ${"var(--sc-accent)"};
    }
    .status.playing { color: var(--sc-accent); }

    .icon-button,
    .small-button {
      border: 0;
      color: var(--sc-muted);
      background: transparent;
      cursor: pointer;
      transition: color 140ms ease, background 140ms ease, border-color 140ms ease;
    }
    .icon-button {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 7px;
    }
    .icon-button:hover { color: var(--sc-text); background: rgba(255,255,255,.07); }
    .icon-button svg { width: 16px; height: 16px; }

    .panel-body {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.18) transparent;
    }

    .column-head {
      display: grid;
      grid-template-columns: 27px minmax(88px, 1fr) 67px 59px 92px 26px;
      gap: 6px;
      padding: 15px 13px 7px;
      color: #7f8182;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .column-head span:first-child { grid-column: 2; }

    .frames { padding: 0 8px; }
    .frame {
      position: relative;
      display: grid;
      grid-template-columns: 27px minmax(88px, 1fr) 67px 59px 92px 26px;
      align-items: center;
      gap: 6px;
      min-height: 68px;
      padding: 8px 5px;
      border: 1px solid transparent;
      border-radius: 9px;
      transition: background 140ms ease, border-color 140ms ease;
    }
    .frame:hover { background: rgba(255,255,255,.035); }
    .frame.selected { background: var(--sc-accent-soft); border-color: rgba(255,102,88,.7); }
    .frame.dragging { opacity: .45; }

    .drag-handle {
      width: 22px;
      height: 30px;
      display: grid;
      place-items: center;
      color: #747779;
      cursor: grab;
      border-radius: 6px;
    }
    .drag-handle:hover { color: #b8b9b8; background: rgba(255,255,255,.05); }
    .drag-handle svg { width: 12px; height: 18px; }

    .frame-meta { min-width: 0; }
    .frame-name {
      width: 100%;
      padding: 3px 4px;
      border: 1px solid transparent;
      border-radius: 5px;
      outline: none;
      color: var(--sc-text);
      background: transparent;
      font-size: 13px;
      font-weight: 600;
    }
    .frame-name:hover { border-color: var(--sc-border); }
    .frame-name:focus { border-color: var(--sc-accent); background: var(--sc-bg); }
    .position-button {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      margin-top: 1px;
      padding: 2px 4px;
      border: 0;
      border-radius: 4px;
      color: var(--sc-muted);
      background: transparent;
      font-size: 11px;
      cursor: pointer;
    }
    .position-button:hover { color: var(--sc-accent); background: rgba(255,102,88,.09); }

    .field,
    .select {
      width: 100%;
      height: 34px;
      border: 1px solid var(--sc-border);
      border-radius: 7px;
      outline: none;
      color: var(--sc-text);
      background: var(--sc-surface);
      font-size: 11px;
      text-align: center;
    }
    .field { padding: 0 5px; }
    .select { padding: 0 6px; text-align: left; }
    .field:hover, .select:hover { border-color: rgba(255,255,255,.22); }
    .field:focus, .select:focus { border-color: var(--sc-accent); box-shadow: 0 0 0 2px rgba(255,102,88,.12); }

    .delete-button { opacity: 0; }
    .frame:hover .delete-button,
    .frame.selected .delete-button { opacity: 1; }
    .delete-button:hover { color: var(--sc-accent); }

    .empty {
      margin: 10px 12px 6px;
      padding: 26px 22px;
      border: 1px dashed rgba(255,255,255,.16);
      border-radius: 10px;
      color: var(--sc-muted);
      text-align: center;
      line-height: 1.55;
    }
    .empty strong { display: block; margin-bottom: 4px; color: var(--sc-text); font-size: 13px; }

    .add-wrap { padding: 11px 13px 14px; }
    .add-button {
      width: 100%;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px dashed rgba(255,255,255,.3);
      border-radius: 8px;
      color: var(--sc-accent);
      background: transparent;
      font-weight: 620;
      cursor: pointer;
      transition: border-color 140ms ease, background 140ms ease;
    }
    .add-button:hover { border-color: var(--sc-accent); background: rgba(255,102,88,.07); }
    .add-button svg { width: 16px; height: 16px; }

    .footer {
      padding: 12px;
      border-top: 1px solid var(--sc-border);
      background: rgba(11,12,13,.22);
    }
    .options {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 11px;
    }
    .toggle-label { display: flex; align-items: center; gap: 7px; color: #c5c4c1; cursor: pointer; }
    .toggle-label input { position: absolute; opacity: 0; pointer-events: none; }
    .toggle {
      position: relative;
      width: 31px;
      height: 18px;
      border-radius: 999px;
      background: #35383b;
      transition: background 140ms ease;
    }
    .toggle::after {
      content: "";
      position: absolute;
      width: 14px;
      height: 14px;
      left: 2px;
      top: 2px;
      border-radius: 50%;
      background: #eee;
      transition: transform 140ms ease;
    }
    input:checked + .toggle { background: var(--sc-accent); }
    input:checked + .toggle::after { transform: translateX(13px); }
    .duration { margin-left: auto; color: var(--sc-muted); font-size: 11px; }
    .duration strong { display: block; color: var(--sc-text); font-size: 15px; text-align: right; }

    .controls { display: grid; grid-template-columns: 1fr 1.5fr; gap: 8px; }
    .secondary,
    .primary {
      height: 43px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 8px;
      font-weight: 680;
      cursor: pointer;
    }
    .secondary { border: 1px solid var(--sc-border); color: var(--sc-text); background: var(--sc-surface); }
    .secondary:hover { background: var(--sc-surface-hover); border-color: rgba(255,255,255,.2); }
    .primary { border: 1px solid var(--sc-accent); color: #141414; background: var(--sc-accent); }
    .primary:hover { filter: brightness(1.05); }
    .primary:disabled { cursor: not-allowed; opacity: .45; filter: none; }
    .primary svg, .secondary svg { width: 16px; height: 16px; }

    .shortcut { margin-top: 8px; color: #717374; font-size: 10px; text-align: center; }
    kbd { padding: 1px 4px; border: 1px solid var(--sc-border); border-radius: 4px; color: #aeb0b0; font-family: inherit; }

    @media (max-width: 520px) {
      .panel { right: 12px; bottom: 12px; }
      .column-head { display: none; }
      .frames { padding-top: 8px; }
      .frame { grid-template-columns: 24px minmax(82px, 1fr) 58px 52px 26px; }
      .frame .select { display: none; }
    }
  `;
  shadow.appendChild(style);

  const icon = (name) => {
    const icons = {
      minus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10h12"/></svg>',
      close: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 5 10 10M15 5 5 15"/></svg>',
      play: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M6.25 4.8a1 1 0 0 1 1.53-.85l8.05 5.2a1 1 0 0 1 0 1.7l-8.05 5.2a1 1 0 0 1-1.53-.85V4.8Z"/></svg>',
      stop: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>',
      plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3.5v13M3.5 10h13"/></svg>',
      trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55"><path d="M4.5 6h11M8 3.75h4M6 6l.6 10h6.8L14 6M8.3 8.5v5M11.7 8.5v5"/></svg>',
      dots: '<svg viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/><circle cx="3" cy="15" r="1.2"/><circle cx="9" cy="15" r="1.2"/></svg>',
      locate: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2"/></svg>',
      update: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 6.5A6.2 6.2 0 1 1 4 12"/><path d="M4.5 3.5v3h3"/></svg>'
    };
    return icons[name];
  };

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const currentProgress = () => maxScroll() === 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / maxScroll()));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  function frameName(progress) {
    if (progress <= 0.04 && !state.frames.some((frame) => frame.name === "Hero")) return "Hero";
    if (progress >= 0.96 && !state.frames.some((frame) => frame.name === "Footer")) return "Footer";
    return `Section ${state.frames.length + 1}`;
  }

  function totalDuration() {
    return state.frames.reduce((sum, frame) => sum + frame.travelMs + frame.holdMs, 0);
  }

  function formatDuration(ms) {
    return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  }

  function frameMarkup(frame) {
    const selected = selectedId === frame.id ? " selected" : "";
    const percent = Math.round(frame.progress * 100);
    return `
      <div class="frame${selected}" data-frame-id="${frame.id}">
        <span class="drag-handle" draggable="true" data-action="drag" title="Drag to reorder">${icon("dots")}</span>
        <div class="frame-meta">
          <input class="frame-name" data-field="name" aria-label="Keyframe name" value="${escapeHtml(frame.name)}">
          <button class="position-button" data-action="seek" title="Scroll to this position">${icon("locate")} ${percent}%</button>
        </div>
        <input class="field" data-field="travel" type="number" min="0" max="60" step="0.1" value="${frame.travelMs / 1000}" aria-label="Travel duration in seconds">
        <input class="field" data-field="hold" type="number" min="0" max="60" step="0.1" value="${frame.holdMs / 1000}" aria-label="Hold duration in seconds">
        <select class="select" data-field="easing" aria-label="Scroll easing">
          <option value="easeInOut" ${frame.easing === "easeInOut" ? "selected" : ""}>Ease in-out</option>
          <option value="easeOut" ${frame.easing === "easeOut" ? "selected" : ""}>Ease out</option>
          <option value="easeIn" ${frame.easing === "easeIn" ? "selected" : ""}>Ease in</option>
          <option value="linear" ${frame.easing === "linear" ? "selected" : ""}>Linear</option>
        </select>
        <button class="icon-button delete-button" data-action="delete" title="Delete keyframe">${icon("trash")}</button>
      </div>`;
  }

  function render() {
    const empty = state.frames.length === 0;
    shadow.querySelector(".panel")?.remove();
    const panel = document.createElement("section");
    panel.className = `panel${minimized ? " minimized" : ""}`;
    panel.setAttribute("aria-label", "Scroller keyframe controls");
    if (panelPosition) {
      panel.style.left = `${panelPosition.left}px`;
      panel.style.top = `${panelPosition.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    panel.innerHTML = `
      <header class="header">
        <span class="brand">Scroller</span>
        <span class="status ${isPlaying ? "playing" : ""}">${escapeHtml(status)}</span>
        <button class="icon-button" data-action="minimize" title="${minimized ? "Expand" : "Minimize"}">${icon("minus")}</button>
        <button class="icon-button" data-action="hide" title="Hide panel">${icon("close")}</button>
      </header>
      <div class="panel-body">
        <div class="column-head"><span>Position</span><span>Travel</span><span>Hold</span><span>Easing</span></div>
        <div class="frames">
          ${empty ? '<div class="empty"><strong>No keyframes yet</strong>Scroll to a section, then capture its position.</div>' : state.frames.map(frameMarkup).join("")}
        </div>
        <div class="add-wrap">
          <button class="add-button" data-action="add">${icon("plus")} Add current position</button>
        </div>
      </div>
      <footer class="footer">
        <div class="options">
          <label class="toggle-label"><input type="checkbox" data-field="loop" ${state.loop ? "checked" : ""}><span class="toggle"></span>Loop</label>
          <label class="toggle-label"><input type="checkbox" data-field="hideWhilePlaying" ${state.hideWhilePlaying ? "checked" : ""}><span class="toggle"></span>Hide on play</label>
          <span class="duration"><strong>${formatDuration(totalDuration())}</strong>total</span>
        </div>
        <div class="controls">
          <button class="secondary" data-action="update" ${selectedId ? "" : "disabled"}>${icon("update")} Update selected</button>
          <button class="primary" data-action="play" ${empty ? "disabled" : ""}>${icon(isPlaying ? "stop" : "play")} ${isPlaying ? "Stop" : "Play sequence"}</button>
        </div>
        <div class="shortcut"><kbd>Esc</kbd> stop · <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> play</div>
      </footer>`;
    shadow.appendChild(panel);
    bindPanel(panel);
  }

  function selectFrame(id) {
    selectedId = id;
    render();
  }

  function addFrame() {
    const progress = currentProgress();
    const frame = {
      id: uid(),
      name: frameName(progress),
      y: Math.round(window.scrollY),
      progress,
      travelMs: state.frames.length === 0 ? 800 : 1800,
      holdMs: 800,
      easing: "easeInOut"
    };
    state.frames.push(frame);
    selectedId = frame.id;
    status = "Position captured";
    save();
    render();
  }

  function updateSelectedPosition() {
    const frame = state.frames.find((item) => item.id === selectedId);
    if (!frame) return;
    frame.y = Math.round(window.scrollY);
    frame.progress = currentProgress();
    status = "Position updated";
    save();
    render();
  }

  function deleteFrame(id) {
    state.frames = state.frames.filter((frame) => frame.id !== id);
    if (selectedId === id) selectedId = state.frames[0]?.id ?? null;
    status = "Keyframe removed";
    save();
    render();
  }

  function updateFrame(id, field, rawValue) {
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;
    if (field === "name") frame.name = rawValue.trim() || "Untitled";
    if (field === "travel") frame.travelMs = Math.max(0, Math.min(60000, Number(rawValue) * 1000 || 0));
    if (field === "hold") frame.holdMs = Math.max(0, Math.min(60000, Number(rawValue) * 1000 || 0));
    if (field === "easing") frame.easing = rawValue;
    status = "Saved";
    save();
    render();
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ [storageKey]: state });
    }, 120);
  }

  function load() {
    chrome.storage.local.get(storageKey, (result) => {
      const saved = result[storageKey];
      if (saved && Array.isArray(saved.frames)) {
        state = { ...state, ...saved };
        selectedId = state.frames[0]?.id ?? null;
        status = "Saved timeline loaded";
      }
      render();
    });
  }

  function seek(frame) {
    const target = Math.round(frame.progress * maxScroll());
    window.scrollTo({ top: target, left: 0, behavior: "auto" });
    selectedId = frame.id;
    status = `At ${frame.name}`;
    render();
  }

  const easingFns = {
    linear: (t) => t,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  };

  function sleep(ms, token) {
    return new Promise((resolve) => {
      const started = performance.now();
      const tick = (now) => {
        if (token !== playbackToken || now - started >= ms) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function animateScroll(targetY, duration, easing, token) {
    if (duration <= 0) {
      window.scrollTo(0, targetY);
      return Promise.resolve();
    }
    const startY = window.scrollY;
    const delta = targetY - startY;
    const started = performance.now();
    const ease = easingFns[easing] || easingFns.easeInOut;
    return new Promise((resolve) => {
      const tick = (now) => {
        if (token !== playbackToken) return resolve();
        const progress = Math.min(1, (now - started) / duration);
        window.scrollTo(0, startY + delta * ease(progress));
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function play() {
    if (isPlaying) {
      stop();
      return;
    }
    if (state.frames.length === 0) return;

    isPlaying = true;
    const token = ++playbackToken;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBehavior = html.style.scrollBehavior;
    const previousBodyBehavior = body?.style.scrollBehavior ?? "";
    html.style.scrollBehavior = "auto";
    if (body) body.style.scrollBehavior = "auto";

    try {
      for (let count = state.countdown; count > 0; count -= 1) {
        status = `Starting in ${count}…`;
        render();
        await sleep(1000, token);
        if (token !== playbackToken) return;
      }

      if (state.hideWhilePlaying) shadow.querySelector(".panel")?.classList.add("recording-hidden");
      do {
        for (const frame of state.frames) {
          if (token !== playbackToken) return;
          const targetY = Math.round(frame.progress * maxScroll());
          await animateScroll(targetY, frame.travelMs, frame.easing, token);
          await sleep(frame.holdMs, token);
        }
      } while (state.loop && token === playbackToken);
    } finally {
      html.style.scrollBehavior = previousHtmlBehavior;
      if (body) body.style.scrollBehavior = previousBodyBehavior;
      if (token === playbackToken) {
        isPlaying = false;
        status = "Playback complete";
        render();
      }
    }
  }

  function stop() {
    if (!isPlaying) return;
    playbackToken += 1;
    isPlaying = false;
    status = "Playback stopped";
    render();
  }

  function reorder(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = state.frames.findIndex((frame) => frame.id === sourceId);
    const targetIndex = state.frames.findIndex((frame) => frame.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = state.frames.splice(sourceIndex, 1);
    state.frames.splice(targetIndex, 0, moved);
    status = "Order updated";
    save();
    render();
  }

  function bindPanel(panel) {
    panel.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      const frameElement = event.target.closest("[data-frame-id]");
      if (frameElement && !actionElement && !event.target.closest("input,select")) selectFrame(frameElement.dataset.frameId);
      if (!actionElement) return;
      const action = actionElement.dataset.action;
      const id = frameElement?.dataset.frameId;
      if (action === "add") addFrame();
      if (action === "delete") deleteFrame(id);
      if (action === "seek") seek(state.frames.find((frame) => frame.id === id));
      if (action === "update") updateSelectedPosition();
      if (action === "play") play();
      if (action === "minimize") { minimized = !minimized; render(); }
      if (action === "hide") root.style.display = "none";
    });

    panel.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      if (field === "loop" || field === "hideWhilePlaying") {
        state[field] = event.target.checked;
        status = "Saved";
        save();
        render();
        return;
      }
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      updateFrame(id, field, event.target.value);
    });

    panel.addEventListener("focusin", (event) => {
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      if (id) selectedId = id;
    });

    panel.addEventListener("dragstart", (event) => {
      const handle = event.target.closest('[data-action="drag"]');
      if (!handle) return;
      dragId = handle.closest("[data-frame-id]")?.dataset.frameId;
      handle.closest(".frame")?.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragId);
    });
    panel.addEventListener("dragover", (event) => {
      if (event.target.closest("[data-frame-id]")) event.preventDefault();
    });
    panel.addEventListener("drop", (event) => {
      const targetId = event.target.closest("[data-frame-id]")?.dataset.frameId;
      if (!targetId) return;
      event.preventDefault();
      reorder(dragId, targetId);
      dragId = null;
    });
    panel.addEventListener("dragend", () => {
      dragId = null;
      panel.querySelectorAll(".dragging").forEach((element) => element.classList.remove("dragging"));
    });

    bindPanelDrag(panel);
  }

  function bindPanelDrag(panel) {
    const header = panel.querySelector(".header");
    let drag = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      panel.style.left = `${Math.min(maxLeft, Math.max(8, event.clientX - drag.x))}px`;
      panel.style.top = `${Math.min(maxTop, Math.max(8, event.clientY - drag.y))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panelPosition = {
        left: Number.parseFloat(panel.style.left),
        top: Number.parseFloat(panel.style.top)
      };
    });
    header.addEventListener("pointerup", () => { drag = null; });
    header.addEventListener("pointercancel", () => { drag = null; });
  }

  function toggle() {
    if (isPlaying) {
      stop();
      root.style.display = "block";
      return;
    }
    root.style.display = root.style.display === "none" ? "block" : "none";
  }

  function onKeydown(event) {
    if (event.key === "Escape" && isPlaying) {
      event.preventDefault();
      stop();
    }
    if (event.altKey && event.shiftKey && event.code === "KeyP") {
      event.preventDefault();
      root.style.display = "block";
      play();
    }
  }

  document.addEventListener("keydown", onKeydown, true);
  window.__SCROLLER_KEYFRAMES__ = { toggle, stop };
  load();
})();
