(() => {
  const reloadAutoplayRequested = Boolean(window.__SCROLLER_RELOAD_AUTOPLAY__)
    || document.documentElement.hasAttribute("data-scroller-reload-autoplay");
  delete window.__SCROLLER_RELOAD_AUTOPLAY__;
  document.documentElement.removeAttribute("data-scroller-reload-autoplay");
  const existing = window.__SCROLLER_KEYFRAMES__;
  if (existing) {
    if (reloadAutoplayRequested) existing.handleCommand("reload-play");
    else existing.toggle();
    return;
  }

  const STORAGE_PREFIX = "scroller-timeline:";
  const root = document.createElement("div");
  root.id = "scroller-extension-root";
  if (reloadAutoplayRequested) root.style.visibility = "hidden";
  const shadow = root.attachShadow({ mode: "open" });
  document.documentElement.appendChild(root);

  const DEFAULT_STATE = {
    frames: [],
    loop: true,
    countdown: 3,
    hideWhilePlaying: true,
    pacingPreset: "custom",
    viewportPreset: "desktop",
    guidePreset: "none"
  };
  let state = { ...DEFAULT_STATE };
  let selectedId = null;
  let isPlaying = false;
  let playbackToken = 0;
  let status = "Ready";
  let saveTimer = null;
  let dragId = null;
  let minimized = false;
  let panelPosition = null;
  let menuFrameId = null;
  let undoAction = null;
  let sequenceMenuOpen = false;
  let confirmAction = null;
  let activeView = "frames";
  let timelineTimeMs = 0;
  let loaded = false;
  let queuedCommand = reloadAutoplayRequested ? "reload-play" : null;

  const PACING_PRESETS = {
    cinematic: { travelMs: 2600, holdMs: 1100, easing: "easeInOut" },
    editorial: { travelMs: 1600, holdMs: 650, easing: "easeInOut" },
    product: { travelMs: 1200, holdMs: 1200, easing: "easeOut" },
    quick: { travelMs: 800, holdMs: 350, easing: "easeOut" }
  };
  const VIEWPORT_PRESETS = {
    desktop: { label: "Desktop · 1440 × 900", width: 1440, height: 900 },
    laptop: { label: "Laptop · 1280 × 800", width: 1280, height: 800 },
    tablet: { label: "Tablet · 768 × 1024", width: 768, height: 1024 },
    mobile: { label: "Mobile · 390 × 844", width: 390, height: 844 }
  };

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
      width: min(420px, calc(100vw - 24px));
      max-height: min(820px, calc(100vh - 24px));
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

    .panel.minimized .view-switch,
    .panel.minimized .confirm-bar,
    .panel.minimized .undo-bar,
    .panel.minimized .panel-body,
    .panel.minimized .footer { display: none; }

    .panel.recording-hidden { display: none; }

    .header {
      position: relative;
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

    .undo-bar {
      min-height: 38px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 13px 0 16px;
      color: #c8c7c4;
      background: #222427;
      border-bottom: 1px solid var(--sc-border);
      font-size: 11px;
    }
    .undo-bar button {
      margin-left: auto;
      padding: 4px 7px;
      border: 1px solid rgba(255,102,88,.5);
      border-radius: 5px;
      color: var(--sc-accent);
      background: transparent;
      cursor: pointer;
    }

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
      flex: 1;
      min-height: 0;
      overflow: hidden;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.18) transparent;
    }

    .timeline-section {
      padding: 13px 14px 11px;
      border-bottom: 1px solid var(--sc-border);
    }
    .timeline-head { display: flex; align-items: center; margin-bottom: 9px; }
    .timeline-title { color: #c9c8c5; font-size: 11px; font-weight: 650; }
    .timeline-time { margin-left: auto; color: var(--sc-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
    .timeline-track {
      position: relative;
      height: 28px;
      border: 1px solid var(--sc-border);
      border-radius: 7px;
      background: #101214;
      cursor: ew-resize;
      overflow: hidden;
      touch-action: none;
    }
    .timeline-progress {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0;
      background: rgba(255,102,88,.08);
      pointer-events: none;
    }
    .timeline-marker {
      position: absolute;
      top: 7px;
      width: 10px;
      height: 10px;
      transform: translateX(-50%) rotate(45deg);
      border: 2px solid #a7a6a3;
      background: #151719;
      border-radius: 2px;
      pointer-events: none;
    }
    .timeline-marker.selected { border-color: var(--sc-accent); background: var(--sc-accent); }
    .timeline-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: var(--sc-accent);
      pointer-events: none;
    }
    .timeline-playhead::before {
      content: "";
      position: absolute;
      top: 0;
      left: -3px;
      border-left: 3px solid transparent;
      border-right: 3px solid transparent;
      border-top: 5px solid var(--sc-accent);
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

    .menu-button { opacity: .68; }
    .menu-button:hover { opacity: 1; color: var(--sc-text); }
    .frame-menu {
      position: absolute;
      z-index: 4;
      right: 3px;
      top: 49px;
      width: 148px;
      padding: 5px;
      border: 1px solid rgba(255,255,255,.17);
      border-radius: 8px;
      background: #25282b;
      box-shadow: 0 14px 35px rgba(0,0,0,.38);
    }
    .frame-menu button {
      width: 100%;
      height: 30px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 9px;
      border: 0;
      border-radius: 5px;
      color: #deddda;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .frame-menu button:hover { background: rgba(255,255,255,.07); }
    .frame-menu button.danger { color: #ff8a80; }
    .frame-menu svg { width: 14px; height: 14px; }

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

    .setup {
      padding: 12px 13px 14px;
      border-top: 1px solid var(--sc-border);
      background: rgba(255,255,255,.012);
    }
    .setup-title {
      margin-bottom: 9px;
      color: #7f8182;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .setup-field label { display: block; margin-bottom: 5px; color: var(--sc-muted); font-size: 10px; }
    .setup-field .select { height: 33px; }
    .viewport-actions { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin-top: 9px; }
    .resize-button {
      min-width: 68px;
      border: 1px solid var(--sc-border);
      border-radius: 7px;
      color: var(--sc-text);
      background: var(--sc-surface);
      font-size: 11px;
      cursor: pointer;
    }
    .resize-button:hover { border-color: rgba(255,255,255,.25); background: var(--sc-surface-hover); }
    .viewport-readout { margin-top: 7px; color: #727475; font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }

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

    .controls { display: grid; grid-template-columns: 1fr 1.35fr; gap: 8px; }
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

    .crop-guide {
      position: fixed;
      z-index: 2147483646;
      pointer-events: none;
      border: 1px solid rgba(255,102,88,.92);
      box-shadow: 0 0 0 9999px rgba(8,10,11,.26), inset 0 0 0 1px rgba(255,255,255,.18);
    }
    .crop-guide::before,
    .crop-guide::after {
      content: "";
      position: absolute;
      background: rgba(255,255,255,.24);
    }
    .crop-guide::before { left: 33.333%; right: 33.333%; top: 0; bottom: 0; border-left: 1px dashed rgba(255,255,255,.22); border-right: 1px dashed rgba(255,255,255,.22); background: transparent; }
    .crop-guide::after { top: 33.333%; bottom: 33.333%; left: 0; right: 0; border-top: 1px dashed rgba(255,255,255,.22); border-bottom: 1px dashed rgba(255,255,255,.22); background: transparent; }
    .crop-guide-label {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 4px 6px;
      border-radius: 4px;
      color: white;
      background: rgba(15,17,18,.82);
      font: 600 10px/1.2 Inter, ui-sans-serif, sans-serif;
    }

    .sequence-button { height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid var(--sc-border); border-radius: 7px; color: #d9d8d5; background: var(--sc-surface); font-size: 11px; cursor: pointer; }
    .sequence-button:hover { border-color: rgba(255,255,255,.24); background: var(--sc-surface-hover); }
    .sequence-button svg { width: 12px; height: 12px; }
    .sequence-menu { position: absolute; z-index: 8; top: 45px; right: 70px; width: 184px; padding: 5px; border: 1px solid rgba(255,255,255,.17); border-radius: 9px; background: #25282b; box-shadow: 0 16px 40px rgba(0,0,0,.42); cursor: default; }
    .sequence-menu button { width: 100%; min-height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 5px; color: #deddda; background: transparent; text-align: left; cursor: pointer; }
    .sequence-menu button:hover { background: rgba(255,255,255,.07); }
    .sequence-menu button.danger { color: #ff8a80; }
    .sequence-menu svg { width: 14px; height: 14px; }

    .view-switch { display: grid; grid-template-columns: 1fr 1fr; padding: 5px; border-bottom: 1px solid var(--sc-border); background: rgba(10,11,12,.2); }
    .view-tab { height: 34px; border: 0; border-radius: 7px; color: #8f9192; background: transparent; font-size: 11px; font-weight: 650; cursor: pointer; }
    .view-tab:hover { color: #cfcecb; background: rgba(255,255,255,.035); }
    .view-tab.active { color: var(--sc-accent); background: rgba(255,102,88,.1); }

    .confirm-bar { min-height: 50px; display: flex; align-items: center; gap: 7px; padding: 7px 11px 7px 15px; border-bottom: 1px solid var(--sc-border); background: #242629; color: #d7d6d3; font-size: 11px; }
    .confirm-bar span { margin-right: auto; }
    .confirm-bar button { height: 28px; padding: 0 9px; border: 1px solid var(--sc-border); border-radius: 6px; color: #d7d6d3; background: var(--sc-surface); cursor: pointer; }
    .confirm-bar button.confirm { border-color: var(--sc-accent); color: #151719; background: var(--sc-accent); font-weight: 650; }

    .compact-frames { max-height: 196px; padding: 5px 8px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
    .compact-frame { position: relative; min-height: 43px; display: grid; grid-template-columns: 23px minmax(92px, 1fr) 54px 44px 27px; align-items: center; gap: 6px; padding: 3px 5px; border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
    .compact-frame:hover { background: rgba(255,255,255,.035); }
    .compact-frame.selected { border-color: rgba(255,102,88,.72); background: var(--sc-accent-soft); }
    .compact-frame.dragging { opacity: .45; }
    .compact-frame .drag-handle { width: 20px; height: 28px; }
    .compact-name { min-width: 0; padding: 0 3px; }
    .compact-name strong { display: block; overflow: hidden; color: var(--sc-text); font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .compact-name small { display: block; margin-top: 1px; color: #737576; font-size: 9px; }
    .compact-position { height: 29px; padding: 0 5px; border: 1px solid transparent; border-radius: 6px; color: #e4e2df; background: transparent; font-size: 13px; font-variant-numeric: tabular-nums; cursor: pointer; }
    .compact-position:hover { border-color: rgba(255,102,88,.4); color: var(--sc-accent); background: rgba(255,102,88,.07); }
    .compact-duration { color: #868889; font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
    .compact-add { padding: 5px 13px 8px; }
    .compact-add .add-button { height: 34px; font-size: 11px; }

    .inspector { margin: 0 10px 9px; padding: 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 10px; background: rgba(255,255,255,.025); }
    .inspector-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .inspector-name { min-width: 0; flex: 1; padding: 3px 5px; border: 1px solid transparent; border-radius: 5px; outline: none; color: var(--sc-text); background: transparent; font-size: 12px; font-weight: 680; }
    .inspector-name:hover { border-color: var(--sc-border); }
    .inspector-name:focus { border-color: var(--sc-accent); background: var(--sc-bg); }
    .inspector-index { color: #77797a; font-size: 10px; white-space: nowrap; }
    .position-heading { display: flex; align-items: center; margin-bottom: 5px; color: #9b9d9e; font-size: 10px; }
    .position-number-wrap { display: flex; align-items: center; margin-left: auto; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-surface); overflow: hidden; }
    .position-number { width: 48px; height: 27px; padding: 0 2px 0 7px; border: 0; outline: none; color: var(--sc-text); background: transparent; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
    .position-number-wrap span { padding-right: 7px; color: #8d8f90; font-size: 10px; }
    .position-slider { width: 100%; height: 20px; margin: 0; appearance: none; background: transparent; cursor: ew-resize; }
    .position-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: linear-gradient(90deg, var(--sc-accent) 0 var(--position), #393c3f var(--position) 100%); }
    .position-slider::-webkit-slider-thumb { width: 14px; height: 14px; margin-top: -5px; appearance: none; border: 2px solid white; border-radius: 50%; background: var(--sc-accent); box-shadow: 0 1px 5px rgba(0,0,0,.35); }
    .position-actions { display: grid; grid-template-columns: .72fr 1.28fr; gap: 7px; margin-top: 5px; }
    .mini-action { height: 31px; border: 1px solid var(--sc-border); border-radius: 7px; color: #deddda; background: var(--sc-surface); font-size: 10px; font-weight: 620; cursor: pointer; }
    .mini-action:hover { background: var(--sc-surface-hover); border-color: rgba(255,255,255,.23); }
    .mini-action.accent { border-color: rgba(255,102,88,.75); color: #171717; background: var(--sc-accent); }
    .timing-grid { display: grid; grid-template-columns: 68px 60px 1fr; gap: 7px; margin-top: 10px; }
    .timing-field label { display: block; margin-bottom: 4px; color: #77797a; font-size: 9px; }
    .timing-field .field, .timing-field .select { height: 31px; }
    .inspector-empty { padding: 18px 14px; color: #818384; font-size: 11px; text-align: center; }

    .setup-view { padding: 15px 14px 16px; overflow-y: auto; }
    .setup-view h2 { margin: 0 0 14px; color: var(--sc-text); font-size: 14px; font-weight: 680; }
    .setup-stack { display: grid; gap: 12px; }
    .setup-control label { display: block; margin-bottom: 5px; color: #858788; font-size: 10px; }
    .setup-control .select, .setup-control .field { height: 36px; }
    .setup-resize { display: grid; grid-template-columns: 1fr auto; gap: 7px; }
    .setup-resize .resize-button { min-width: 104px; }
    .setup-current { margin-top: 5px; color: #717374; font-size: 9px; }
    .guide-options { display: grid; grid-template-columns: repeat(5, 1fr); }
    .guide-option { height: 34px; border: 1px solid var(--sc-border); border-right: 0; color: #a8a9a8; background: var(--sc-surface); font-size: 10px; cursor: pointer; }
    .guide-option:first-child { border-radius: 7px 0 0 7px; }
    .guide-option:last-child { border-right: 1px solid var(--sc-border); border-radius: 0 7px 7px 0; }
    .guide-option.active { color: var(--sc-accent); border-color: var(--sc-accent); background: rgba(255,102,88,.08); }
    .setup-toggles { display: grid; gap: 10px; padding-top: 2px; }
    .setup-toggle-row { display: flex; align-items: center; color: #c5c4c1; }
    .setup-toggle-row .toggle { margin-left: auto; }
    .setup-note { color: #717374; font-size: 9px; }
    .footer-meta { display: flex; align-items: center; min-height: 24px; margin-bottom: 7px; color: #77797a; font-size: 10px; }
    .footer-meta .duration { margin-left: auto; }
    .footer-meta .duration strong { display: inline; margin-right: 4px; font-size: 12px; }

    .shortcut { margin-top: 8px; color: #717374; font-size: 10px; text-align: center; }
    kbd { padding: 1px 4px; border: 1px solid var(--sc-border); border-radius: 4px; color: #aeb0b0; font-family: inherit; }

    @media (max-width: 520px) {
      .panel { right: 12px; bottom: 12px; }
      .column-head { display: none; }
      .frames { padding-top: 8px; }
      .frame { grid-template-columns: 24px minmax(82px, 1fr) 58px 52px 26px; }
      .frame .select { display: none; }
      .setup-grid { grid-template-columns: 1fr; }
      .panel { max-height: calc(100vh - 24px); }
      .sequence-button { padding: 0 7px; }
      .compact-frames { max-height: 172px; }
      .inspector { margin-left: 8px; margin-right: 8px; }
      .setup-view { padding: 12px; }
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
      more: '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4.5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15.5" cy="10" r="1.3"/></svg>',
      locate: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2"/></svg>',
      update: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 6.5A6.2 6.2 0 1 1 4 12"/><path d="M4.5 3.5v3h3"/></svg>',
      duplicate: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5"/><path d="M13.5 6.5v-2h-9v9h2"/></svg>',
      reload: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15.5 7A6 6 0 1 0 16 12"/><path d="M12.5 7h3V4"/></svg>'
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

  function markerTimes() {
    let cursor = 0;
    return state.frames.map((frame) => {
      cursor += frame.travelMs;
      const arrival = cursor;
      cursor += frame.holdMs;
      return { id: frame.id, name: frame.name, arrival };
    });
  }

  function timelineMarkup() {
    const total = Math.max(1, totalDuration());
    return markerTimes().map((marker) => {
      const left = Math.min(100, marker.arrival / total * 100);
      return `<span class="timeline-marker${marker.id === selectedId ? " selected" : ""}" style="left:${left}%" title="${escapeHtml(marker.name)} · ${formatDuration(marker.arrival)}"></span>`;
    }).join("");
  }

  function frameMarkup(frame, index) {
    const selected = selectedId === frame.id ? " selected" : "";
    const percent = Math.round(frame.progress * 100);
    return `
      <div class="compact-frame${selected}" data-frame-id="${frame.id}">
        <span class="drag-handle" draggable="true" data-action="drag" title="Drag to reorder">${icon("dots")}</span>
        <div class="compact-name" title="${escapeHtml(frame.name)}">
          <strong>${escapeHtml(frame.name)}</strong>
          <small>Keyframe ${index + 1}</small>
        </div>
        <button class="compact-position" data-action="seek" title="Go to ${percent}%">${percent}%</button>
        <span class="compact-duration">${formatDuration(frame.travelMs + frame.holdMs)}</span>
        <button class="icon-button menu-button" data-action="menu" title="Keyframe actions">${icon("more")}</button>
        ${menuFrameId === frame.id ? `
          <div class="frame-menu" role="menu">
            <button data-action="update-frame">${icon("update")} Update position</button>
            <button data-action="duplicate">${icon("duplicate")} Duplicate</button>
            <button class="danger" data-action="delete">${icon("trash")} Delete</button>
          </div>` : ""}
      </div>`;
  }

  function inspectorMarkup() {
    const frame = state.frames.find((item) => item.id === selectedId);
    if (!frame) return '<div class="inspector-empty">Select a keyframe to edit its position and timing.</div>';
    const index = state.frames.findIndex((item) => item.id === frame.id);
    const percent = Math.round(frame.progress * 1000) / 10;
    return `
      <div class="inspector" data-frame-id="${frame.id}">
        <div class="inspector-header">
          <input class="inspector-name" data-field="name" aria-label="Keyframe name" value="${escapeHtml(frame.name)}">
          <span class="inspector-index">Keyframe ${index + 1}</span>
        </div>
        <div class="position-heading">
          <span>Position</span>
          <label class="position-number-wrap"><input class="position-number" data-field="position" type="number" min="0" max="100" step="0.1" value="${percent}" aria-label="Scroll position percentage"><span>%</span></label>
        </div>
        <input class="position-slider" data-field="positionRange" type="range" min="0" max="100" step="0.1" value="${percent}" style="--position:${percent}%" aria-label="Scroll position">
        <div class="position-actions">
          <button class="mini-action" data-action="seek-selected">Go to position</button>
          <button class="mini-action accent" data-action="use-current">Use current scroll</button>
        </div>
        <div class="timing-grid">
          <div class="timing-field"><label>Travel</label><input class="field" data-field="travel" type="number" min="0" max="60" step="0.1" value="${frame.travelMs / 1000}" aria-label="Travel duration in seconds"></div>
          <div class="timing-field"><label>Hold</label><input class="field" data-field="hold" type="number" min="0" max="60" step="0.1" value="${frame.holdMs / 1000}" aria-label="Hold duration in seconds"></div>
          <div class="timing-field"><label>Easing</label><select class="select" data-field="easing" aria-label="Scroll easing">
            <option value="easeInOut" ${frame.easing === "easeInOut" ? "selected" : ""}>Ease in-out</option>
            <option value="easeOut" ${frame.easing === "easeOut" ? "selected" : ""}>Ease out</option>
            <option value="easeIn" ${frame.easing === "easeIn" ? "selected" : ""}>Ease in</option>
            <option value="linear" ${frame.easing === "linear" ? "selected" : ""}>Linear</option>
          </select></div>
        </div>
      </div>`;
  }

  function setupViewMarkup() {
    return `
      <div class="setup-view">
        <h2>Recording setup</h2>
        <div class="setup-stack">
          <div class="setup-control"><label>Pacing</label><select class="select" data-field="pacingPreset">
            <option value="custom" ${state.pacingPreset === "custom" ? "selected" : ""}>Custom</option>
            <option value="cinematic" ${state.pacingPreset === "cinematic" ? "selected" : ""}>Cinematic</option>
            <option value="editorial" ${state.pacingPreset === "editorial" ? "selected" : ""}>Editorial</option>
            <option value="product" ${state.pacingPreset === "product" ? "selected" : ""}>Product tour</option>
            <option value="quick" ${state.pacingPreset === "quick" ? "selected" : ""}>Quick showcase</option>
          </select></div>
          <div class="setup-control"><label>Viewport</label><div class="setup-resize">
            <select class="select" data-field="viewportPreset" aria-label="Viewport preset">${Object.entries(VIEWPORT_PRESETS).map(([key, preset]) => `<option value="${key}" ${state.viewportPreset === key ? "selected" : ""}>${preset.label}</option>`).join("")}</select>
            <button class="resize-button" data-action="resize">Resize viewport</button>
          </div><div class="setup-current">Current · ${window.innerWidth} × ${window.innerHeight}</div></div>
          <div class="setup-control"><label>Crop guide</label><div class="guide-options">${["none", "16:9", "4:5", "9:16", "1:1"].map((guide) => `<button class="guide-option${state.guidePreset === guide ? " active" : ""}" data-action="set-guide" data-value="${guide}">${guide === "none" ? "None" : guide}</button>`).join("")}</div></div>
          <div class="setup-control"><label>Start delay</label><input class="field" data-field="countdown" type="number" min="0" max="30" step="1" value="${state.countdown}" aria-label="Start delay in seconds"></div>
          <div class="setup-toggles">
            <label class="setup-toggle-row">Loop<input type="checkbox" data-field="loop" ${state.loop ? "checked" : ""} hidden><span class="toggle"></span></label>
            <label class="setup-toggle-row">Hide on play<input type="checkbox" data-field="hideWhilePlaying" ${state.hideWhilePlaying ? "checked" : ""} hidden><span class="toggle"></span></label>
          </div>
          <div class="setup-note">Guides hide automatically during playback.</div>
        </div>
      </div>`;
  }

  function confirmationMarkup() {
    if (!confirmAction) return "";
    const copy = {
      clear: { message: `Clear all ${state.frames.length} keyframes?`, confirm: "Clear" },
      new: { message: "Start a new sequence and reset setup?", confirm: "Start new" },
      reset: { message: "Reset recording setup to defaults?", confirm: "Reset" }
    }[confirmAction];
    return `<div class="confirm-bar"><span>${copy.message}</span><button data-action="cancel-confirm">Cancel</button><button class="confirm" data-action="confirm-master">${copy.confirm}</button></div>`;
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
        <button class="sequence-button" data-action="sequence-menu">Sequence ${icon("more")}</button>
        ${sequenceMenuOpen ? `<div class="sequence-menu" role="menu">
          <button data-action="request-new">${icon("plus")} New sequence</button>
          <button data-action="request-reset">${icon("update")} Reset recording setup</button>
          <button class="danger" data-action="request-clear">${icon("trash")} Clear all keyframes</button>
        </div>` : ""}
        <button class="icon-button" data-action="minimize" title="${minimized ? "Expand" : "Minimize"}">${icon("minus")}</button>
        <button class="icon-button" data-action="hide" title="Hide panel">${icon("close")}</button>
      </header>
      <div class="view-switch"><button class="view-tab${activeView === "frames" ? " active" : ""}" data-action="view-frames">Frames</button><button class="view-tab${activeView === "setup" ? " active" : ""}" data-action="view-setup">Setup</button></div>
      ${confirmationMarkup()}
      ${undoAction ? `<div class="undo-bar"><span>${escapeHtml(undoAction.label)}</span><button data-action="undo">Undo</button></div>` : ""}
      <div class="panel-body">
        ${activeView === "setup" ? setupViewMarkup() : `
          <div class="timeline-section">
            <div class="timeline-head"><span class="timeline-title">Timeline</span><span class="timeline-time">${formatDuration(timelineTimeMs)} / ${formatDuration(totalDuration())}</span></div>
            <div class="timeline-track" data-action="timeline-scrub" aria-label="Scrub sequence timeline"><span class="timeline-progress" style="width:${Math.min(100, timelineTimeMs / Math.max(1, totalDuration()) * 100)}%"></span>${timelineMarkup()}<span class="timeline-playhead" style="left:${Math.min(100, timelineTimeMs / Math.max(1, totalDuration()) * 100)}%"></span></div>
          </div>
          <div class="compact-frames">${empty ? '<div class="empty"><strong>No keyframes yet</strong>Scroll to a section, then capture its position.</div>' : state.frames.map(frameMarkup).join("")}</div>
          <div class="compact-add"><button class="add-button" data-action="add">${icon("plus")} Add current position</button></div>
          ${inspectorMarkup()}`}
      </div>
      <footer class="footer">
        <div class="footer-meta"><span>${state.frames.length} keyframe${state.frames.length === 1 ? "" : "s"}</span><span class="duration"><strong>${formatDuration(totalDuration())}</strong>total</span></div>
        <div class="controls">
          <button class="secondary" data-action="play" ${empty ? "disabled" : ""}>${icon(isPlaying ? "stop" : "play")} ${isPlaying ? "Stop" : "Preview"}</button>
          <button class="primary" data-action="reload-play" ${empty || isPlaying ? "disabled" : ""}>${icon("reload")} Reload &amp; play</button>
        </div>
        <div class="shortcut"><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> capture · <kbd>P</kbd> play · <kbd>Esc</kbd> stop</div>
      </footer>`;
    shadow.appendChild(panel);
    bindPanel(panel);
    renderGuide();
  }

  function selectFrame(id) {
    selectedId = id;
    menuFrameId = null;
    render();
  }

  function addFrame() {
    undoAction = null;
    const progress = currentProgress();
    const preset = PACING_PRESETS[state.pacingPreset];
    const frame = {
      id: uid(),
      name: frameName(progress),
      y: Math.round(window.scrollY),
      progress,
      travelMs: preset?.travelMs ?? (state.frames.length === 0 ? 800 : 1800),
      holdMs: preset?.holdMs ?? 800,
      easing: preset?.easing ?? "easeInOut"
    };
    state.frames.push(frame);
    selectedId = frame.id;
    activeView = "frames";
    status = "Position captured";
    save();
    render();
  }

  function updateFramePosition(id = selectedId) {
    undoAction = null;
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;
    frame.y = Math.round(window.scrollY);
    frame.progress = currentProgress();
    status = "Position updated";
    save();
    render();
  }

  function setFrameProgress(id, rawPercent, { live = false } = {}) {
    undoAction = null;
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;
    const percent = Math.max(0, Math.min(100, Number(rawPercent) || 0));
    frame.progress = percent / 100;
    frame.y = Math.round(frame.progress * maxScroll());
    selectedId = id;
    status = "Position updated";
    window.scrollTo(0, frame.y);
    save();
    if (!live) render();
  }

  function deleteFrame(id) {
    const index = state.frames.findIndex((frame) => frame.id === id);
    if (index < 0) return;
    rememberForUndo(`“${state.frames[index].name}” deleted`);
    state.frames.splice(index, 1);
    menuFrameId = null;
    if (selectedId === id) selectedId = state.frames[0]?.id ?? null;
    status = "Keyframe deleted";
    save();
    render();
  }

  function duplicateFrame(id) {
    undoAction = null;
    const index = state.frames.findIndex((frame) => frame.id === id);
    if (index < 0) return;
    const copy = {
      ...state.frames[index],
      id: uid(),
      name: `${state.frames[index].name} copy`
    };
    state.frames.splice(index + 1, 0, copy);
    selectedId = copy.id;
    menuFrameId = null;
    status = "Keyframe duplicated";
    save();
    render();
  }

  function rememberForUndo(label) {
    undoAction = {
      label,
      state: JSON.parse(JSON.stringify(state)),
      selectedId
    };
  }

  function undoLastAction() {
    if (!undoAction) return;
    state = undoAction.state;
    selectedId = undoAction.selectedId;
    undoAction = null;
    status = "Change undone";
    save();
    render();
  }

  function performMasterAction() {
    if (!confirmAction) return;
    rememberForUndo(confirmAction === "clear" ? "All keyframes cleared" : confirmAction === "new" ? "New sequence started" : "Recording setup reset");
    if (confirmAction === "clear") {
      state.frames = [];
      selectedId = null;
      timelineTimeMs = 0;
      activeView = "frames";
      status = "Keyframes cleared";
    }
    if (confirmAction === "new") {
      state = { ...DEFAULT_STATE, frames: [] };
      selectedId = null;
      timelineTimeMs = 0;
      activeView = "frames";
      status = "New sequence ready";
    }
    if (confirmAction === "reset") {
      state = {
        ...state,
        loop: DEFAULT_STATE.loop,
        countdown: DEFAULT_STATE.countdown,
        hideWhilePlaying: DEFAULT_STATE.hideWhilePlaying,
        pacingPreset: DEFAULT_STATE.pacingPreset,
        viewportPreset: DEFAULT_STATE.viewportPreset,
        guidePreset: DEFAULT_STATE.guidePreset
      };
      status = "Recording setup reset";
    }
    confirmAction = null;
    sequenceMenuOpen = false;
    save();
    render();
  }

  function applyPacingPreset(name) {
    undoAction = null;
    state.pacingPreset = name;
    const preset = PACING_PRESETS[name];
    if (preset) {
      state.frames = state.frames.map((frame) => ({ ...frame, ...preset }));
      status = `${name === "product" ? "Product tour" : name[0].toUpperCase() + name.slice(1)} pacing applied`;
    } else {
      status = "Custom pacing";
    }
    timelineTimeMs = Math.min(timelineTimeMs, totalDuration());
    save();
    render();
  }

  function updateFrame(id, field, rawValue) {
    undoAction = null;
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;
    if (field === "name") frame.name = rawValue.trim() || "Untitled";
    if (field === "travel") frame.travelMs = Math.max(0, Math.min(60000, Number(rawValue) * 1000 || 0));
    if (field === "hold") frame.holdMs = Math.max(0, Math.min(60000, Number(rawValue) * 1000 || 0));
    if (field === "easing") frame.easing = rawValue;
    if (["travel", "hold", "easing"].includes(field)) state.pacingPreset = "custom";
    timelineTimeMs = Math.min(timelineTimeMs, totalDuration());
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

  function saveImmediately() {
    clearTimeout(saveTimer);
    return new Promise((resolve) => chrome.storage.local.set({ [storageKey]: state }, resolve));
  }

  function load() {
    chrome.storage.local.get(storageKey, (result) => {
      const saved = result[storageKey];
      if (saved && Array.isArray(saved.frames)) {
        state = { ...state, ...saved };
        selectedId = state.frames[0]?.id ?? null;
        status = "Saved timeline loaded";
      }
      loaded = true;
      render();
      if (queuedCommand) {
        const command = queuedCommand;
        queuedCommand = null;
        handleCommand(command);
      }
    });
  }

  function seek(frame) {
    const target = Math.round(frame.progress * maxScroll());
    window.scrollTo({ top: target, left: 0, behavior: "auto" });
    selectedId = frame.id;
    timelineTimeMs = markerTimes().find((marker) => marker.id === frame.id)?.arrival ?? 0;
    status = `At ${frame.name}`;
    render();
  }

  function renderGuide() {
    shadow.querySelector(".crop-guide")?.remove();
    if (state.guidePreset === "none" || isPlaying) return;
    const [wide, tall] = state.guidePreset.split(":").map(Number);
    if (!wide || !tall) return;
    const ratio = wide / tall;
    const availableWidth = window.innerWidth * 0.9;
    const availableHeight = window.innerHeight * 0.9;
    let width = availableWidth;
    let height = width / ratio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }
    const guide = document.createElement("div");
    guide.className = "crop-guide";
    guide.style.left = `${(window.innerWidth - width) / 2}px`;
    guide.style.top = `${(window.innerHeight - height) / 2}px`;
    guide.style.width = `${width}px`;
    guide.style.height = `${height}px`;
    guide.innerHTML = `<span class="crop-guide-label">Safe crop · ${state.guidePreset}</span>`;
    shadow.appendChild(guide);
  }

  function resizeViewport() {
    const preset = VIEWPORT_PRESETS[state.viewportPreset];
    if (!preset) return;
    status = `Resizing to ${preset.width} × ${preset.height}`;
    render();
    chrome.runtime.sendMessage({
      type: "SCROLLER_RESIZE_VIEWPORT",
      width: preset.width,
      height: preset.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        status = "Could not resize this window";
      } else {
        status = `${preset.label} ready`;
      }
      render();
    });
  }

  async function reloadAndPlay() {
    if (state.frames.length === 0 || isPlaying) return;
    status = "Reloading for recording…";
    await saveImmediately();
    render();
    chrome.runtime.sendMessage({ type: "SCROLLER_RELOAD_AND_PLAY" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        status = "Reload could not start";
        render();
      }
    });
  }

  const easingFns = {
    linear: (t) => t,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  };

  function setTimelineTime(ms) {
    timelineTimeMs = Math.max(0, Math.min(totalDuration(), ms));
    const percent = timelineTimeMs / Math.max(1, totalDuration()) * 100;
    const panel = shadow.querySelector(".panel");
    const playhead = panel?.querySelector(".timeline-playhead");
    const progress = panel?.querySelector(".timeline-progress");
    const readout = panel?.querySelector(".timeline-time");
    if (playhead) playhead.style.left = `${percent}%`;
    if (progress) progress.style.width = `${percent}%`;
    if (readout) readout.textContent = `${formatDuration(timelineTimeMs)} / ${formatDuration(totalDuration())}`;
  }

  function scrubToTime(ms) {
    if (state.frames.length === 0 || isPlaying) return;
    const time = Math.max(0, Math.min(totalDuration(), ms));
    let cursor = 0;
    let previousProgress = state.frames[0].progress;
    for (const frame of state.frames) {
      const travelEnd = cursor + frame.travelMs;
      if (time <= travelEnd) {
        const amount = frame.travelMs === 0 ? 1 : (time - cursor) / frame.travelMs;
        const eased = (easingFns[frame.easing] || easingFns.easeInOut)(Math.max(0, Math.min(1, amount)));
        const pageProgress = previousProgress + (frame.progress - previousProgress) * eased;
        window.scrollTo(0, pageProgress * maxScroll());
        selectedId = frame.id;
        setTimelineTime(time);
        return;
      }
      cursor = travelEnd;
      const holdEnd = cursor + frame.holdMs;
      if (time <= holdEnd) {
        window.scrollTo(0, frame.progress * maxScroll());
        selectedId = frame.id;
        setTimelineTime(time);
        return;
      }
      cursor = holdEnd;
      previousProgress = frame.progress;
    }
    window.scrollTo(0, state.frames.at(-1).progress * maxScroll());
    selectedId = state.frames.at(-1).id;
    setTimelineTime(time);
  }

  function sleep(ms, token, onProgress) {
    if (ms <= 0) {
      onProgress?.(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / ms);
        onProgress?.(progress);
        if (token !== playbackToken || progress >= 1) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function animateScroll(targetY, duration, easing, token, onProgress) {
    if (duration <= 0) {
      window.scrollTo(0, targetY);
      onProgress?.(1);
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
        onProgress?.(progress);
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function play({ stealth = false } = {}) {
    if (isPlaying) {
      stop();
      return;
    }
    if (state.frames.length === 0) return;

    isPlaying = true;
    if (stealth) root.style.visibility = "hidden";
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
        let elapsed = 0;
        setTimelineTime(0);
        for (const frame of state.frames) {
          if (token !== playbackToken) return;
          const targetY = Math.round(frame.progress * maxScroll());
          const travelStart = elapsed;
          await animateScroll(targetY, frame.travelMs, frame.easing, token, (progress) => setTimelineTime(travelStart + frame.travelMs * progress));
          elapsed += frame.travelMs;
          const holdStart = elapsed;
          await sleep(frame.holdMs, token, (progress) => setTimelineTime(holdStart + frame.holdMs * progress));
          elapsed += frame.holdMs;
        }
      } while (state.loop && token === playbackToken);
    } finally {
      html.style.scrollBehavior = previousHtmlBehavior;
      if (body) body.style.scrollBehavior = previousBodyBehavior;
      root.style.visibility = "visible";
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
    root.style.visibility = "visible";
    status = "Playback stopped";
    render();
  }

  function reorder(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = state.frames.findIndex((frame) => frame.id === sourceId);
    const targetIndex = state.frames.findIndex((frame) => frame.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    undoAction = null;
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
      if (!actionElement) {
        if ((menuFrameId && !event.target.closest(".frame-menu")) || sequenceMenuOpen) {
          menuFrameId = null;
          sequenceMenuOpen = false;
          render();
        }
        return;
      }
      const action = actionElement.dataset.action;
      const id = frameElement?.dataset.frameId;
      if (action === "add") addFrame();
      if (action === "delete") deleteFrame(id);
      if (action === "duplicate") duplicateFrame(id);
      if (action === "undo") undoLastAction();
      if (action === "menu") { menuFrameId = menuFrameId === id ? null : id; selectedId = id; render(); }
      if (action === "seek") seek(state.frames.find((frame) => frame.id === id));
      if (action === "seek-selected") seek(state.frames.find((frame) => frame.id === id));
      if (action === "use-current") updateFramePosition(id);
      if (action === "update-frame") { menuFrameId = null; updateFramePosition(id); }
      if (action === "sequence-menu") { sequenceMenuOpen = !sequenceMenuOpen; menuFrameId = null; render(); }
      if (action === "view-frames") { activeView = "frames"; sequenceMenuOpen = false; render(); }
      if (action === "view-setup") { activeView = "setup"; sequenceMenuOpen = false; render(); }
      if (action === "request-clear") { sequenceMenuOpen = false; confirmAction = state.frames.length ? "clear" : null; status = state.frames.length ? status : "No keyframes to clear"; render(); }
      if (action === "request-new") { sequenceMenuOpen = false; confirmAction = "new"; render(); }
      if (action === "request-reset") { sequenceMenuOpen = false; confirmAction = "reset"; render(); }
      if (action === "cancel-confirm") { confirmAction = null; render(); }
      if (action === "confirm-master") performMasterAction();
      if (action === "set-guide") { undoAction = null; state.guidePreset = actionElement.dataset.value; status = "Guide updated"; save(); render(); }
      if (action === "play") play();
      if (action === "reload-play") reloadAndPlay();
      if (action === "resize") resizeViewport();
      if (action === "minimize") { minimized = !minimized; render(); }
      if (action === "hide") root.style.display = "none";
    });

    panel.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      if (field === "loop" || field === "hideWhilePlaying") {
        undoAction = null;
        state[field] = event.target.checked;
        status = "Saved";
        save();
        render();
        return;
      }
      if (field === "pacingPreset") {
        applyPacingPreset(event.target.value);
        return;
      }
      if (field === "viewportPreset") {
        undoAction = null;
        state[field] = event.target.value;
        status = "Saved";
        save();
        render();
        return;
      }
      if (field === "countdown") {
        undoAction = null;
        state.countdown = Math.max(0, Math.min(30, Number(event.target.value) || 0));
        status = "Start delay updated";
        save();
        render();
        return;
      }
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      if (field === "position" || field === "positionRange") {
        setFrameProgress(id, event.target.value);
        return;
      }
      updateFrame(id, field, event.target.value);
    });

    panel.addEventListener("input", (event) => {
      if (event.target.dataset.field !== "positionRange") return;
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      const percent = Math.max(0, Math.min(100, Number(event.target.value) || 0));
      event.target.style.setProperty("--position", `${percent}%`);
      const number = event.target.closest(".inspector")?.querySelector('[data-field="position"]');
      if (number) number.value = percent;
      const rowPosition = panel.querySelector(`.compact-frame[data-frame-id="${id}"] .compact-position`);
      if (rowPosition) rowPosition.textContent = `${Math.round(percent)}%`;
      setFrameProgress(id, percent, { live: true });
    });

    panel.addEventListener("focusin", (event) => {
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      if (id) selectedId = id;
    });

    panel.addEventListener("dragstart", (event) => {
      const handle = event.target.closest('[data-action="drag"]');
      if (!handle) return;
      dragId = handle.closest("[data-frame-id]")?.dataset.frameId;
      handle.closest(".compact-frame")?.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragId);
    });
    panel.addEventListener("dragover", (event) => {
      if (event.target.closest(".compact-frame")) event.preventDefault();
    });
    panel.addEventListener("drop", (event) => {
      const targetId = event.target.closest(".compact-frame")?.dataset.frameId;
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
    bindTimelineDrag(panel);
  }

  function bindTimelineDrag(panel) {
    const track = panel.querySelector(".timeline-track");
    if (!track) return;
    let scrubbing = false;
    const update = (event) => {
      const rect = track.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      scrubToTime(progress * totalDuration());
    };
    track.addEventListener("pointerdown", (event) => {
      if (isPlaying) return;
      scrubbing = true;
      track.setPointerCapture(event.pointerId);
      update(event);
    });
    track.addEventListener("pointermove", (event) => {
      if (scrubbing) update(event);
    });
    track.addEventListener("pointerup", () => { scrubbing = false; });
    track.addEventListener("pointercancel", () => { scrubbing = false; });
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
      root.style.visibility = "visible";
      return;
    }
    root.style.visibility = "visible";
    root.style.display = root.style.display === "none" ? "block" : "none";
  }

  function handleCommand(command) {
    if (!loaded) {
      queuedCommand = command;
      return;
    }
    if (command === "add-keyframe") addFrame();
    if (command === "play-sequence") {
      root.style.display = "block";
      play();
    }
    if (command === "reload-play") play({ stealth: true });
  }

  function onKeydown(event) {
    if (event.key === "Escape" && isPlaying) {
      event.preventDefault();
      stop();
      return;
    }
    if (event.key === "Escape" && menuFrameId) {
      menuFrameId = null;
      render();
    }
    if (event.altKey && event.shiftKey && event.code === "KeyP") {
      event.preventDefault();
      root.style.display = "block";
      play();
    }
    if (event.altKey && event.shiftKey && event.code === "KeyK") {
      event.preventDefault();
      addFrame();
    }
  }

  document.addEventListener("keydown", onKeydown, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SCROLLER_COMMAND") handleCommand(message.command);
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      panelPosition = null;
      if (root.style.display !== "none") render();
      else renderGuide();
    }, 140);
  });
  window.__SCROLLER_KEYFRAMES__ = { toggle, stop, handleCommand };
  load();
})();
