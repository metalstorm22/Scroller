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
    reloadBeforeStart: false,
    pacingPreset: "custom",
    viewportPreset: "desktop",
    guidePreset: "none",
    panelSize: null
  };
  let state = { ...DEFAULT_STATE };
  let selectedId = null;
  let isPlaying = false;
  let isArming = false;
  let autoplayHandled = false;
  let playbackToken = 0;
  let status = "Ready";
  let saveTimer = null;
  let minimized = false;
  let panelPosition = null;
  let undoAction = null;
  let sequenceMenuOpen = false;
  let confirmAction = null;
  let activeView = "frames";
  let timelineTimeMs = 0;
  let loaded = false;
  let introPlayed = false;
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
      --sc-accent: #ff6a55;
      --sc-accent-hi: #ff8a72;
      --sc-accent-dim: rgba(255, 106, 85, 0.14);
      --sc-accent-line: rgba(255, 106, 85, 0.45);
      --sc-bg: #0d0f11;
      --sc-panel: #141719;
      --sc-elev-1: #1a1e21;
      --sc-elev-2: #22262a;
      --sc-elev-3: #2a2f34;
      --sc-line: rgba(255, 255, 255, 0.07);
      --sc-line-strong: rgba(255, 255, 255, 0.14);
      --sc-text: #eceef0;
      --sc-muted: #8d9399;
      --sc-faint: #666d73;
      --sc-danger: #ff7a6b;
      --sc-sans: "Inter var", Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --sc-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
      --sc-r-sm: 6px;
      --sc-r-md: 8px;
      --sc-r-lg: 12px;
      --sc-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
      color-scheme: dark;
    }

    * { box-sizing: border-box; }
    button, input, select { font: inherit; }
    button { -webkit-tap-highlight-color: transparent; }
    :focus { outline: none; }
    :focus-visible {
      outline: 2px solid var(--sc-accent);
      outline-offset: 1px;
      border-radius: var(--sc-r-sm);
    }

    ::-webkit-scrollbar { width: 9px; height: 9px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      border: 3px solid transparent;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      background-clip: content-box;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); background-clip: content-box; }

    @keyframes sc-in {
      from { opacity: 0; transform: translateY(8px) scale(0.985); }
      to { opacity: 1; transform: none; }
    }
    @keyframes sc-pop {
      from { opacity: 0; transform: translateY(-4px) scale(0.97); }
      to { opacity: 1; transform: none; }
    }
    @keyframes sc-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }

    .panel {
      position: fixed;
      z-index: 2147483647;
      right: 20px;
      bottom: 20px;
      width: min(470px, calc(100vw - 24px));
      max-height: min(840px, calc(100vh - 24px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--sc-text);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0) 140px),
        rgba(20, 23, 25, 0.94);
      backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.5),
        0 32px 80px -12px rgba(0, 0, 0, 0.62),
        0 8px 24px -8px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.07);
      font-family: var(--sc-sans);
      font-size: 12.5px;
      line-height: 1.4;
      letter-spacing: -0.005em;
      -webkit-font-smoothing: antialiased;
    }

    .panel.intro { animation: sc-in 220ms var(--sc-ease); }

    .panel.minimized {
      width: min(300px, calc(100vw - 24px));
      border-radius: 13px;
    }
    .panel.minimized .view-switch,
    .panel.minimized .confirm-bar,
    .panel.minimized .undo-bar,
    .panel.minimized .panel-body,
    .panel.minimized .footer { display: none; }
    .panel.minimized .header { border-bottom: 0; }

    .panel.recording-hidden { display: none; }
    .panel.resizing { user-select: none; }

    /* ---------- resize handles ---------- */

    .resize-handle { position: absolute; z-index: 20; touch-action: none; }
    .resize-handle.n { top: 0; left: 10px; right: 10px; height: 5px; cursor: ns-resize; }
    .resize-handle.s { bottom: 0; left: 10px; right: 10px; height: 5px; cursor: ns-resize; }
    .resize-handle.w { left: 0; top: 10px; bottom: 10px; width: 5px; cursor: ew-resize; }
    .resize-handle.e { right: 0; top: 10px; bottom: 10px; width: 5px; cursor: ew-resize; }
    .resize-handle.nw { top: 0; left: 0; width: 14px; height: 14px; cursor: nwse-resize; }
    .resize-handle.se { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }
    .resize-handle.ne { top: 0; right: 0; width: 14px; height: 14px; cursor: nesw-resize; }
    .resize-handle.sw { bottom: 0; left: 0; width: 14px; height: 14px; cursor: nesw-resize; }
    /* Only the corner facing open page area gets a visible affordance. */
    .resize-handle.nw::after {
      content: "";
      position: absolute;
      top: 5px;
      left: 5px;
      width: 7px;
      height: 7px;
      border-top: 1.5px solid var(--sc-faint);
      border-left: 1.5px solid var(--sc-faint);
      border-radius: 3px 0 0 0;
      opacity: 0;
      transition: opacity 160ms var(--sc-ease), border-color 160ms var(--sc-ease);
    }
    .panel:hover .resize-handle.nw::after { opacity: 0.7; }
    .resize-handle.nw:hover::after { opacity: 1; border-color: var(--sc-accent); }

    /* ---------- header ---------- */

    .header {
      position: relative;
      min-height: 46px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 8px 0 12px;
      border-bottom: 1px solid var(--sc-line);
      cursor: grab;
      user-select: none;
    }
    .header:active { cursor: grabbing; }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
      font-weight: 620;
      letter-spacing: -0.015em;
      color: var(--sc-text);
    }
    .brand-mark {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border-radius: var(--sc-r-sm);
      color: var(--sc-accent);
      background: var(--sc-accent-dim);
      box-shadow: inset 0 0 0 1px var(--sc-accent-line);
    }
    .brand-mark svg { width: 13px; height: 13px; }

    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin-right: auto;
      padding: 3px 8px 3px 7px;
      border-radius: 999px;
      border: 1px solid var(--sc-line);
      background: rgba(255, 255, 255, 0.035);
      color: var(--sc-muted);
      font-size: 10.5px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status::before {
      content: "";
      width: 5px;
      height: 5px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: #6b7076;
    }
    .status.playing {
      color: var(--sc-accent);
      border-color: var(--sc-accent-line);
      background: var(--sc-accent-dim);
    }
    .status.playing::before {
      background: var(--sc-accent);
      box-shadow: 0 0 6px var(--sc-accent);
      animation: sc-pulse 1.1s ease-in-out infinite;
    }

    .icon-button,
    .small-button {
      border: 0;
      color: var(--sc-faint);
      background: transparent;
      cursor: pointer;
      transition: color 140ms var(--sc-ease), background 140ms var(--sc-ease);
    }
    .icon-button {
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border-radius: var(--sc-r-sm);
    }
    .icon-button:hover { color: var(--sc-text); background: rgba(255, 255, 255, 0.08); }
    .danger-icon:hover { color: var(--sc-danger); background: rgba(255, 122, 107, 0.13); }
    .inspector-header .icon-button { width: 24px; height: 24px; flex: 0 0 auto; }
    .inspector-header .icon-button svg { width: 13px; height: 13px; }
    .icon-button:active { background: rgba(255, 255, 255, 0.12); }
    .icon-button svg { width: 15px; height: 15px; }

    .sequence-button {
      height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0 8px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-sm);
      color: var(--sc-muted);
      background: rgba(255, 255, 255, 0.035);
      font-size: 11px;
      font-weight: 550;
      cursor: pointer;
      transition: color 140ms var(--sc-ease), background 140ms var(--sc-ease), border-color 140ms var(--sc-ease);
    }
    .sequence-button:hover { color: var(--sc-text); border-color: var(--sc-line-strong); background: rgba(255, 255, 255, 0.07); }
    .sequence-button svg { width: 10px; height: 10px; opacity: 0.8; }

    /* ---------- popovers ---------- */

    .sequence-menu {
      position: absolute;
      z-index: 8;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.11);
      border-radius: 10px;
      background: rgba(38, 42, 47, 0.97);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.4),
        0 18px 44px -10px rgba(0, 0, 0, 0.6);
      cursor: default;
      animation: sc-pop 130ms var(--sc-ease);
    }
    .sequence-menu { top: 40px; right: 66px; width: 190px; }
    .sequence-menu button {
      width: 100%;
      min-height: 30px;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 0 8px;
      border: 0;
      border-radius: var(--sc-r-sm);
      color: #d7dade;
      background: transparent;
      font-size: 11.5px;
      text-align: left;
      cursor: pointer;
      transition: background 110ms var(--sc-ease), color 110ms var(--sc-ease);
    }
    .sequence-menu button:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
    .sequence-menu button.danger { color: var(--sc-danger); }
    .sequence-menu button.danger:hover { background: rgba(255, 122, 107, 0.13); }
    .sequence-menu svg { width: 13px; height: 13px; flex: 0 0 auto; opacity: 0.75; }

    /* ---------- segmented view switch ---------- */

    .view-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
      margin: 8px 10px 2px;
      padding: 2px;
      border-radius: 9px;
      background: rgba(0, 0, 0, 0.28);
      box-shadow: inset 0 0 0 1px var(--sc-line);
    }
    .view-tab {
      height: 26px;
      border: 0;
      border-radius: 7px;
      color: var(--sc-muted);
      background: transparent;
      font-size: 11px;
      font-weight: 580;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: color 140ms var(--sc-ease), background 140ms var(--sc-ease), box-shadow 140ms var(--sc-ease);
    }
    .view-tab:hover { color: #c4c9cd; }
    .view-tab.active {
      color: var(--sc-text);
      background: var(--sc-elev-2);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    /* ---------- banners ---------- */

    .undo-bar,
    .confirm-bar {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 8px 10px 0;
      padding: 8px 8px 8px 11px;
      border: 1px solid var(--sc-line);
      border-radius: 10px;
      background: var(--sc-elev-1);
      color: #c8ccd0;
      font-size: 11px;
    }
    .undo-bar span,
    .confirm-bar span { margin-right: auto; min-width: 0; }
    .undo-bar button,
    .confirm-bar button {
      height: 26px;
      flex: 0 0 auto;
      padding: 0 9px;
      border: 1px solid var(--sc-line-strong);
      border-radius: var(--sc-r-sm);
      color: #d7dade;
      background: rgba(255, 255, 255, 0.05);
      font-size: 11px;
      font-weight: 550;
      cursor: pointer;
      transition: background 140ms var(--sc-ease), border-color 140ms var(--sc-ease);
    }
    .undo-bar button:hover,
    .confirm-bar button:hover { background: rgba(255, 255, 255, 0.1); }
    .undo-bar button {
      margin-left: auto;
      border-color: var(--sc-accent-line);
      color: var(--sc-accent);
      background: var(--sc-accent-dim);
    }
    .undo-bar button:hover { background: rgba(255, 106, 85, 0.2); }
    .confirm-bar { border-color: rgba(255, 106, 85, 0.28); background: rgba(255, 106, 85, 0.06); }
    .confirm-bar button.confirm {
      border-color: transparent;
      color: #17110f;
      background: var(--sc-accent);
      font-weight: 620;
    }
    .confirm-bar button.confirm:hover { background: var(--sc-accent-hi); }

    .panel-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
    }

    /* ---------- timeline ---------- */

    .timeline-section { padding: 12px 12px 13px; }
    .timeline-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    .timeline-title {
      color: var(--sc-faint);
      font-size: 9.5px;
      font-weight: 620;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    .timeline-time {
      margin-left: auto;
      color: var(--sc-muted);
      font-family: var(--sc-mono);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    .timeline-legend {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--sc-faint);
      font-size: 9px;
      letter-spacing: 0.02em;
    }
    .timeline-legend i {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      display: inline-block;
    }
    .timeline-legend i.travel { background: linear-gradient(180deg, rgba(255, 106, 85, 0.75), rgba(255, 106, 85, 0.45)); }
    .timeline-legend i.hold {
      background:
        repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0 2px, transparent 2px 4px),
        rgba(255, 255, 255, 0.1);
    }
    .timeline-legend span + i { margin-left: 4px; }

    .timeline-editor { position: relative; }

    .timeline-ruler {
      position: relative;
      height: 15px;
      border: 1px solid var(--sc-line);
      border-bottom: 0;
      border-radius: var(--sc-r-md) var(--sc-r-md) 0 0;
      background:
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 5%),
        linear-gradient(180deg, #101315, #0b0d0e);
      cursor: ew-resize;
      overflow: hidden;
      touch-action: none;
    }
    .timeline-ruler:hover { border-color: var(--sc-line-strong); }
    .timeline-progress {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0;
      background: linear-gradient(90deg, rgba(255, 106, 85, 0.06), rgba(255, 106, 85, 0.24));
      pointer-events: none;
    }

    .timeline-lane {
      display: flex;
      gap: 2px;
      height: 46px;
      padding: 3px;
      border: 1px solid var(--sc-line);
      border-radius: 0 0 var(--sc-r-md) var(--sc-r-md);
      background: linear-gradient(180deg, #0a0c0d, #101315);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
      touch-action: none;
    }
    .timeline-lane.empty-lane {
      align-items: center;
      justify-content: center;
      color: var(--sc-faint);
      font-size: 10px;
    }

    .clip {
      position: relative;
      display: flex;
      flex: 0 1 0;
      min-width: 12px;
      border-radius: var(--sc-r-sm);
      cursor: grab;
      transition: transform 140ms var(--sc-ease), opacity 140ms var(--sc-ease);
    }
    /* Reordering suspends the width transition so clips snap to their new slot
       under the cursor instead of lagging behind it. */
    .timeline-lane.reordering .clip { transition: none; }
    .clip.dragging {
      z-index: 4;
      cursor: grabbing;
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 0 0 1.5px var(--sc-accent), 0 6px 16px rgba(0, 0, 0, 0.55);
    }
    .clip.dragging .clip-handle { opacity: 0; }
    .clip-travel,
    .clip-hold {
      position: relative;
      flex: 0 1 0;
      min-width: 4px;
      transition: background 140ms var(--sc-ease);
    }
    .clip-travel {
      border-radius: var(--sc-r-sm) 0 0 var(--sc-r-sm);
      background: linear-gradient(180deg, rgba(255, 106, 85, 0.44), rgba(255, 106, 85, 0.26));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
    }
    .clip-hold {
      border-radius: 0 var(--sc-r-sm) var(--sc-r-sm) 0;
      background:
        repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0 3px, transparent 3px 6px),
        rgba(255, 255, 255, 0.06);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }
    .clip:hover .clip-travel { background: linear-gradient(180deg, rgba(255, 106, 85, 0.58), rgba(255, 106, 85, 0.36)); }
    .clip:hover .clip-hold { background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0 3px, transparent 3px 6px), rgba(255, 255, 255, 0.09); }
    .clip.selected {
      z-index: 2;
      box-shadow: 0 0 0 1.5px var(--sc-accent), 0 2px 10px rgba(255, 106, 85, 0.32);
    }
    .clip.selected .clip-travel { background: linear-gradient(180deg, var(--sc-accent-hi), var(--sc-accent)); }

    .clip-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 5px;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.92);
      font-size: 9.5px;
      font-weight: 620;
      letter-spacing: -0.01em;
      white-space: nowrap;
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .clip-label b {
      font-family: var(--sc-mono);
      font-weight: 600;
      opacity: 0.7;
    }
    .clip.selected .clip-label { color: #24100b; text-shadow: none; }
    .clip.selected .clip-label b { opacity: 0.55; }

    .clip-handle {
      position: absolute;
      z-index: 3;
      top: -3px;
      bottom: -3px;
      right: -5px;
      width: 11px;
      display: grid;
      place-items: center;
      cursor: ew-resize;
      touch-action: none;
    }
    .clip-handle::after {
      content: "";
      width: 2px;
      height: 100%;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.26);
      transition: background 120ms var(--sc-ease), box-shadow 120ms var(--sc-ease);
    }
    .clip-handle:hover::after,
    .clip-handle.active::after {
      background: #fff;
      box-shadow: 0 0 7px rgba(255, 255, 255, 0.6);
    }
    .clip:last-child .clip-hold .clip-handle { right: -3px; }
    .timeline-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: var(--sc-accent);
      box-shadow: 0 0 8px rgba(255, 106, 85, 0.6);
      pointer-events: none;
    }
    .timeline-playhead::before {
      content: "";
      position: absolute;
      top: -1px;
      left: -3.5px;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--sc-accent);
    }

    /* ---------- body layout ---------- */

    /* Fixed blocks; the inspector absorbs height when the panel is resized. */
    .timeline-section,
    .timeline-add { flex: 0 0 auto; }
    .inspector,
    .inspector-empty {
      flex: 1 1 auto;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
    }
    .setup-view { flex: 1 1 auto; overflow-y: auto; }

    /* ---------- add button ---------- */

    .timeline-add { padding: 8px 12px 12px; }
    .add-button {
      width: 100%;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border: 1px dashed rgba(255, 255, 255, 0.18);
      border-radius: var(--sc-r-md);
      color: var(--sc-muted);
      background: transparent;
      font-size: 11.5px;
      font-weight: 560;
      cursor: pointer;
      transition: color 140ms var(--sc-ease), border-color 140ms var(--sc-ease), background 140ms var(--sc-ease);
    }
    .add-button:hover {
      border-color: var(--sc-accent-line);
      border-style: solid;
      color: var(--sc-accent);
      background: rgba(255, 106, 85, 0.07);
    }
    .add-button svg { width: 14px; height: 14px; }

    /* ---------- fields ---------- */

    .field,
    .select {
      width: 100%;
      height: 30px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-sm);
      outline: none;
      color: var(--sc-text);
      background: var(--sc-elev-1);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28);
      font-size: 11.5px;
      transition: border-color 140ms var(--sc-ease), box-shadow 140ms var(--sc-ease);
    }
    .field {
      padding: 0 7px;
      font-family: var(--sc-mono);
      font-variant-numeric: tabular-nums;
    }
    .select {
      padding: 0 24px 0 8px;
      text-align: left;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%238d9399' stroke-width='1.5'%3E%3Cpath d='m3 4.75 3 3 3-3'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 7px center;
      background-size: 12px;
    }
    .field:hover, .select:hover { border-color: var(--sc-line-strong); }
    .field:focus, .select:focus {
      border-color: var(--sc-accent);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28), 0 0 0 3px rgba(255, 106, 85, 0.16);
    }

    /* ---------- inspector ---------- */

    .inspector {
      margin: 0 10px 12px;
      padding: 11px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-lg);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
    }
    .inspector-header { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; }
    .inspector-name {
      min-width: 0;
      flex: 1;
      height: 26px;
      padding: 0 6px;
      border: 1px solid transparent;
      border-radius: var(--sc-r-sm);
      outline: none;
      color: var(--sc-text);
      background: transparent;
      font-size: 12.5px;
      font-weight: 620;
      letter-spacing: -0.012em;
      transition: border-color 140ms var(--sc-ease), background 140ms var(--sc-ease);
    }
    .inspector-name:hover { border-color: var(--sc-line); background: rgba(255, 255, 255, 0.035); }
    .inspector-name:focus {
      border-color: var(--sc-accent);
      background: var(--sc-bg);
      box-shadow: 0 0 0 3px rgba(255, 106, 85, 0.16);
    }
    .inspector-index {
      flex: 0 0 auto;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.07);
      color: var(--sc-muted);
      font-family: var(--sc-mono);
      font-size: 9.5px;
      white-space: nowrap;
    }
    .position-heading {
      display: flex;
      align-items: center;
      margin-bottom: 7px;
      color: var(--sc-faint);
      font-size: 9.5px;
      font-weight: 620;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    .position-number-wrap {
      display: flex;
      align-items: center;
      margin-left: auto;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-sm);
      background: var(--sc-elev-1);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28);
      overflow: hidden;
      transition: border-color 140ms var(--sc-ease), box-shadow 140ms var(--sc-ease);
    }
    .position-number-wrap:focus-within {
      border-color: var(--sc-accent);
      box-shadow: 0 0 0 3px rgba(255, 106, 85, 0.16);
    }
    .position-number {
      width: 46px;
      height: 24px;
      padding: 0 1px 0 6px;
      border: 0;
      outline: none;
      color: var(--sc-text);
      background: transparent;
      font-family: var(--sc-mono);
      font-size: 11.5px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .position-number::-webkit-outer-spin-button,
    .position-number::-webkit-inner-spin-button { appearance: none; margin: 0; }
    .position-number-wrap span {
      padding: 0 7px 0 2px;
      color: var(--sc-faint);
      font-family: var(--sc-mono);
      font-size: 10px;
      letter-spacing: 0.02em;
    }
    .position-slider {
      width: 100%;
      height: 18px;
      margin: 0;
      appearance: none;
      background: transparent;
      cursor: ew-resize;
    }
    .position-slider::-webkit-slider-runnable-track {
      height: 5px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--sc-accent) 0 var(--position), rgba(255, 255, 255, 0.1) var(--position) 100%);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
    }
    .position-slider::-webkit-slider-thumb {
      width: 13px;
      height: 13px;
      margin-top: -4px;
      appearance: none;
      border: 2px solid #fff;
      border-radius: 50%;
      background: var(--sc-accent);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      transition: transform 120ms var(--sc-ease);
    }
    .position-slider:hover::-webkit-slider-thumb { transform: scale(1.12); }
    .position-slider:active::-webkit-slider-thumb { transform: scale(1.2); }
    .position-actions { display: grid; grid-template-columns: 1fr 1.2fr; gap: 6px; margin-top: 7px; }
    .mini-action {
      height: 29px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-sm);
      color: #d3d7db;
      background: var(--sc-elev-2);
      font-size: 10.5px;
      font-weight: 570;
      cursor: pointer;
      transition: background 140ms var(--sc-ease), border-color 140ms var(--sc-ease);
    }
    .mini-action:hover { background: var(--sc-elev-3); border-color: var(--sc-line-strong); }
    .mini-action.accent {
      border-color: transparent;
      color: #17110f;
      background: var(--sc-accent);
      font-weight: 620;
    }
    .mini-action.accent:hover { background: var(--sc-accent-hi); }

    .timing-grid { display: grid; grid-template-columns: 1fr 1fr 1.35fr; gap: 6px; margin-top: 11px; }
    .timing-field label {
      display: block;
      margin-bottom: 5px;
      color: var(--sc-faint);
      font-size: 9px;
      font-weight: 620;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .timing-field .field, .timing-field .select { height: 29px; }
    .inspector-empty {
      margin: 0 10px 12px;
      padding: 18px 14px;
      border: 1px dashed var(--sc-line);
      border-radius: var(--sc-r-lg);
      color: var(--sc-faint);
      font-size: 11px;
      line-height: 1.5;
      text-align: center;
    }
    .inspector-empty strong {
      display: block;
      margin-bottom: 4px;
      color: var(--sc-text);
      font-size: 12.5px;
      font-weight: 600;
    }

    /* ---------- setup view ---------- */

    .setup-view { padding: 12px 12px 16px; }
    .setup-view h2 {
      margin: 0 0 12px;
      color: var(--sc-faint);
      font-size: 9.5px;
      font-weight: 620;
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    .setup-stack { display: grid; gap: 12px; }
    .setup-control label {
      display: block;
      margin-bottom: 5px;
      color: var(--sc-muted);
      font-size: 10px;
      font-weight: 550;
    }
    .setup-control .select, .setup-control .field { height: 32px; }
    .setup-resize { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
    .setup-resize .resize-button { min-width: 96px; }
    .resize-button {
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-sm);
      color: var(--sc-text);
      background: var(--sc-elev-2);
      font-size: 11px;
      font-weight: 560;
      cursor: pointer;
      transition: background 140ms var(--sc-ease), border-color 140ms var(--sc-ease);
    }
    .resize-button:hover { border-color: var(--sc-line-strong); background: var(--sc-elev-3); }
    .setup-current {
      margin-top: 6px;
      color: var(--sc-faint);
      font-family: var(--sc-mono);
      font-size: 9.5px;
    }

    .guide-options {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 2px;
      padding: 2px;
      border-radius: var(--sc-r-md);
      background: rgba(0, 0, 0, 0.28);
      box-shadow: inset 0 0 0 1px var(--sc-line);
    }
    .guide-option {
      height: 28px;
      border: 0;
      border-radius: var(--sc-r-sm);
      color: var(--sc-muted);
      background: transparent;
      font-size: 10.5px;
      font-weight: 550;
      cursor: pointer;
      transition: color 140ms var(--sc-ease), background 140ms var(--sc-ease);
    }
    .guide-option:hover { color: #c4c9cd; background: rgba(255, 255, 255, 0.05); }
    .guide-option.active {
      color: var(--sc-accent);
      background: rgba(255, 106, 85, 0.14);
      box-shadow: inset 0 0 0 1px var(--sc-accent-line);
    }

    .setup-toggles {
      display: grid;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--sc-line);
      border-radius: var(--sc-r-md);
      background: rgba(255, 255, 255, 0.02);
    }
    .setup-toggle-row {
      display: flex;
      align-items: center;
      min-height: 34px;
      padding: 0 9px;
      border-radius: var(--sc-r-sm);
      color: #c9cdd1;
      font-size: 11.5px;
      cursor: pointer;
      transition: background 120ms var(--sc-ease);
    }
    .setup-toggle-row:hover { background: rgba(255, 255, 255, 0.035); }
    .setup-toggle-row .toggle { margin-left: auto; }
    .setup-note {
      color: var(--sc-faint);
      font-size: 10px;
      line-height: 1.45;
    }

    /* ---------- toggle ---------- */

    .toggle-label { display: flex; align-items: center; gap: 7px; color: #c9cdd1; cursor: pointer; }
    .toggle-label input { position: absolute; opacity: 0; pointer-events: none; }
    .toggle {
      position: relative;
      width: 30px;
      height: 17px;
      flex: 0 0 auto;
      border-radius: 999px;
      background: #33383d;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
      transition: background 160ms var(--sc-ease);
    }
    .toggle::after {
      content: "";
      position: absolute;
      width: 13px;
      height: 13px;
      left: 2px;
      top: 2px;
      border-radius: 50%;
      background: #e8eaec;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      transition: transform 160ms var(--sc-ease);
    }
    input:checked + .toggle { background: var(--sc-accent); }
    input:checked + .toggle::after { transform: translateX(13px); background: #fff; }

    /* ---------- footer ---------- */

    .footer {
      padding: 11px 12px 12px;
      border-top: 1px solid var(--sc-line);
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.3));
    }
    .footer-meta {
      display: flex;
      align-items: baseline;
      min-height: 20px;
      margin-bottom: 9px;
      color: var(--sc-faint);
      font-size: 10.5px;
    }
    .duration { margin-left: auto; color: var(--sc-faint); font-size: 10.5px; }
    .duration strong {
      margin-right: 4px;
      color: var(--sc-text);
      font-family: var(--sc-mono);
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .controls { display: grid; grid-template-columns: 1fr 1.3fr; gap: 7px; }
    .reload-toggle {
      display: flex;
      align-items: center;
      gap: 7px;
      height: 38px;
      padding: 0 10px;
      border: 1px solid var(--sc-line-strong);
      border-radius: var(--sc-r-md);
      background: var(--sc-elev-2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
      color: #c9cdd1;
      font-size: 11.5px;
      font-weight: 560;
      letter-spacing: -0.008em;
      cursor: pointer;
      transition: background 140ms var(--sc-ease), border-color 140ms var(--sc-ease), color 140ms var(--sc-ease);
    }
    .reload-toggle:hover { background: var(--sc-elev-3); border-color: rgba(255, 255, 255, 0.2); }
    .reload-toggle svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--sc-faint); transition: color 140ms var(--sc-ease); }
    .reload-toggle .toggle { margin-left: auto; width: 26px; height: 15px; }
    .reload-toggle .toggle::after { width: 11px; height: 11px; }
    .reload-toggle input:checked + .toggle::after { transform: translateX(11px); }
    .reload-toggle:has(input:checked) {
      border-color: var(--sc-accent-line);
      background: var(--sc-accent-dim);
      color: var(--sc-text);
    }
    .reload-toggle:has(input:checked) svg { color: var(--sc-accent); }
    .reload-toggle:has(input:disabled) { cursor: not-allowed; opacity: 0.4; }
    .secondary,
    .primary {
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: var(--sc-r-md);
      font-size: 12px;
      font-weight: 620;
      letter-spacing: -0.008em;
      cursor: pointer;
      transition: background 140ms var(--sc-ease), border-color 140ms var(--sc-ease), transform 90ms var(--sc-ease), box-shadow 140ms var(--sc-ease);
    }
    .secondary {
      border: 1px solid var(--sc-line-strong);
      color: var(--sc-text);
      background: var(--sc-elev-2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .secondary:hover { background: var(--sc-elev-3); border-color: rgba(255, 255, 255, 0.2); }
    .primary {
      border: 0;
      color: #1a0f0c;
      background: linear-gradient(180deg, var(--sc-accent-hi), var(--sc-accent));
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 6px 18px -6px rgba(255, 106, 85, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }
    .primary:hover { background: linear-gradient(180deg, #ff9c86, var(--sc-accent-hi)); }
    .secondary:active, .primary:active { transform: translateY(1px); }
    .primary:disabled, .secondary:disabled {
      cursor: not-allowed;
      opacity: 0.4;
      box-shadow: none;
      transform: none;
    }
    .primary svg, .secondary svg { width: 14px; height: 14px; }

    .shortcut {
      margin-top: 9px;
      color: var(--sc-faint);
      font-size: 9.5px;
      text-align: center;
      letter-spacing: 0.01em;
    }
    kbd {
      display: inline-block;
      min-width: 15px;
      padding: 1px 4px;
      border: 1px solid var(--sc-line-strong);
      border-bottom-width: 2px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      color: #a5abb0;
      font-family: var(--sc-mono);
      font-size: 9px;
      line-height: 1.3;
    }

    /* ---------- crop guide ---------- */

    .crop-guide {
      position: fixed;
      z-index: 2147483646;
      pointer-events: none;
      border: 1px solid rgba(255, 106, 85, 0.9);
      box-shadow: 0 0 0 9999px rgba(6, 8, 9, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }
    .crop-guide::before,
    .crop-guide::after {
      content: "";
      position: absolute;
      background: transparent;
    }
    .crop-guide::before { left: 33.333%; right: 33.333%; top: 0; bottom: 0; border-left: 1px dashed rgba(255,255,255,.2); border-right: 1px dashed rgba(255,255,255,.2); }
    .crop-guide::after { top: 33.333%; bottom: 33.333%; left: 0; right: 0; border-top: 1px dashed rgba(255,255,255,.2); border-bottom: 1px dashed rgba(255,255,255,.2); }
    .crop-guide-label {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 4px 7px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      background: rgba(15, 17, 18, 0.86);
      backdrop-filter: blur(8px);
      font: 600 10px/1.2 var(--sc-sans);
      letter-spacing: 0.02em;
    }

    @media (max-width: 520px) {
      .panel { right: 12px; bottom: 12px; max-height: calc(100vh - 24px); }
      .position-actions { grid-template-columns: 1fr; }
      .timing-grid { grid-template-columns: 1fr 1fr; }
      .timing-field:last-child { grid-column: span 2; }
      .setup-view { padding: 12px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .sequence-menu { animation: none; }
      * { transition-duration: 1ms !important; }
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
      locate: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2"/></svg>',
      update: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 6.5A6.2 6.2 0 1 1 4 12"/><path d="M4.5 3.5v3h3"/></svg>',
      duplicate: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5"/><path d="M13.5 6.5v-2h-9v9h2"/></svg>',
      reload: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15.5 7A6 6 0 1 0 16 12"/><path d="M12.5 7h3V4"/></svg>',
      chevron: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 8 4.5 4.5L14.5 8"/></svg>',
      mark: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14.5c3-1 4.2-9 7-9s4 8 7 9"/><circle cx="3" cy="14.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="5.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none"/></svg>'
    };
    return icons[name];
  };

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const currentProgress = () => maxScroll() === 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / maxScroll()));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
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

  function clipMarkup(frame, index, arrival) {
    const selected = frame.id === selectedId ? " selected" : "";
    return `
      <div class="clip${selected}" data-frame-id="${frame.id}" style="flex-grow:${Math.max(1, frame.travelMs + frame.holdMs)}">
        <span class="clip-travel" style="flex-grow:${frame.travelMs}" title="${escapeHtml(frame.name)} · travel ${formatDuration(frame.travelMs)}, arrives at ${formatDuration(arrival)} · drag to reorder">
          <span class="clip-label"><b>${index + 1}</b>${escapeHtml(frame.name)}</span>
          <span class="clip-handle" data-handle="travel" title="Drag to retime arrival"></span>
        </span>
        <span class="clip-hold" style="flex-grow:${frame.holdMs}" title="Hold ${formatDuration(frame.holdMs)}">
          <span class="clip-handle" data-handle="hold" title="Drag to change hold"></span>
        </span>
      </div>`;
  }

  function timelineMarkup() {
    const percent = Math.min(100, timelineTimeMs / Math.max(1, totalDuration()) * 100);
    const arrivals = markerTimes();
    const lane = state.frames.length === 0
      ? '<div class="timeline-lane empty-lane">Capture a position to build the timeline</div>'
      : `<div class="timeline-lane" aria-label="Keyframe timing track — drag clips to reorder">${state.frames.map((frame, index) => clipMarkup(frame, index, arrivals[index].arrival)).join("")}</div>`;
    return `
      <div class="timeline-editor">
        <div class="timeline-ruler" aria-label="Scrub sequence timeline"><span class="timeline-progress" style="width:${percent}%"></span></div>
        ${lane}
        <span class="timeline-playhead" style="left:${percent}%"></span>
      </div>`;
  }

  function inspectorMarkup() {
    const frame = state.frames.find((item) => item.id === selectedId);
    if (!frame) {
      return state.frames.length === 0
        ? '<div class="inspector-empty"><strong>No keyframes yet</strong>Scroll to a section, then capture its position.</div>'
        : '<div class="inspector-empty">Select a clip on the timeline to edit its position and timing.</div>';
    }
    const index = state.frames.findIndex((item) => item.id === frame.id);
    const percent = Math.round(frame.progress * 1000) / 10;
    return `
      <div class="inspector" data-frame-id="${frame.id}">
        <div class="inspector-header">
          <input class="inspector-name" data-field="name" aria-label="Keyframe name" value="${escapeHtml(frame.name)}">
          <span class="inspector-index">Keyframe ${index + 1}</span>
          <button class="icon-button" data-action="duplicate" title="Duplicate keyframe">${icon("duplicate")}</button>
          <button class="icon-button danger-icon" data-action="delete" title="Delete keyframe">${icon("trash")}</button>
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
          <div class="setup-note">Guides hide automatically during playback. With <strong>Reload first</strong> on, the start delay runs before the reload.</div>
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
    const running = isPlaying || isArming;
    shadow.querySelector(".panel")?.remove();
    const panel = document.createElement("section");
    panel.className = `panel${minimized ? " minimized" : ""}${introPlayed ? "" : " intro"}`;
    introPlayed = true;
    panel.setAttribute("aria-label", "Scroller keyframe controls");
    if (panelPosition) {
      panel.style.left = `${panelPosition.left}px`;
      panel.style.top = `${panelPosition.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    if (!minimized && state.panelSize) {
      if (state.panelSize.width) panel.style.width = `${state.panelSize.width}px`;
      if (state.panelSize.height) {
        panel.style.height = `${state.panelSize.height}px`;
        panel.style.maxHeight = "none";
      }
    }
    panel.innerHTML = `
      <header class="header">
        <span class="brand"><span class="brand-mark">${icon("mark")}</span>Scroller</span>
        <span class="status ${running ? "playing" : ""}" title="${escapeHtml(status)}">${escapeHtml(status)}</span>
        <button class="sequence-button" data-action="sequence-menu" aria-haspopup="menu" aria-expanded="${sequenceMenuOpen}">Sequence ${icon("chevron")}</button>
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
            <div class="timeline-head">
              <span class="timeline-title">Timeline</span>
              ${empty ? "" : '<span class="timeline-legend"><i class="travel"></i><span>Travel</span><i class="hold"></i><span>Hold</span></span>'}
              <span class="timeline-time">${formatDuration(timelineTimeMs)} / ${formatDuration(totalDuration())}</span>
            </div>
            ${timelineMarkup()}
          </div>
          <div class="timeline-add"><button class="add-button" data-action="add">${icon("plus")} Add current position</button></div>
          ${inspectorMarkup()}`}
      </div>
      <footer class="footer">
        <div class="footer-meta"><span>${state.frames.length} keyframe${state.frames.length === 1 ? "" : "s"}</span><span class="duration"><strong>${formatDuration(totalDuration())}</strong>total</span></div>
        <div class="controls">
          <label class="reload-toggle" title="Reload the page before the sequence starts, so the recording includes the page-load animation">
            ${icon("reload")}<span>Reload first</span>
            <input type="checkbox" data-field="reloadBeforeStart" ${state.reloadBeforeStart ? "checked" : ""} ${running ? "disabled" : ""} hidden><span class="toggle"></span>
          </label>
          <button class="primary" data-action="start" ${empty ? "disabled" : ""}>${icon(running ? "stop" : "play")} ${running ? "Stop" : "Start"}</button>
        </div>
        <div class="shortcut"><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> capture · <kbd>P</kbd> start · <kbd>Esc</kbd> stop</div>
      </footer>
      ${minimized ? "" : ["n", "s", "w", "e", "nw", "ne", "sw", "se"].map((dir) => `<span class="resize-handle ${dir}" data-resize="${dir}" title="Drag to resize panel"></span>`).join("")}`;
    shadow.appendChild(panel);
    bindPanel(panel);
    renderGuide();
  }

  function selectFrame(id) {
    selectedId = id;
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
      // Panel size is workspace chrome, not sequence data — keep it across a reset.
      state = { ...DEFAULT_STATE, frames: [], panelSize: state.panelSize };
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
        reloadBeforeStart: DEFAULT_STATE.reloadBeforeStart,
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

  // Single entry point for the footer button, the keyboard shortcut, and the
  // toolbar command. The post-reload autoplay path must never come through here
  // or the reload toggle would loop the page forever — it calls play() directly.
  function start() {
    if (isPlaying || isArming) {
      stop();
      return;
    }
    if (state.reloadBeforeStart) reloadAndPlay();
    else play();
  }

  // The start delay runs here, before the reload — so the recording captures the
  // page load itself. Playback after the reload therefore skips its own delay.
  async function reloadAndPlay() {
    if (state.frames.length === 0 || isPlaying || isArming) return;
    const token = ++playbackToken;
    isArming = true;
    try {
      for (let count = state.countdown; count > 0; count -= 1) {
        status = `Reloading in ${count}…`;
        render();
        await sleep(1000, token);
        if (token !== playbackToken) return;
      }
      status = "Reloading for recording…";
      await saveImmediately();
      if (token !== playbackToken) return;
      render();
      chrome.runtime.sendMessage({ type: "SCROLLER_RELOAD_AND_PLAY" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          isArming = false;
          status = "Reload could not start";
          render();
        }
      });
    } finally {
      if (token !== playbackToken) isArming = false;
    }
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

  // Starting is not a toggle — start() owns stop/start. A second call while
  // already playing is a duplicate trigger and must be ignored, not treated as
  // a stop, or the post-reload autoplay cancels itself.
  async function play({ stealth = false, skipCountdown = false } = {}) {
    if (isPlaying) return;
    if (state.frames.length === 0) return;

    isArming = false;
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
      for (let count = skipCountdown ? 0 : state.countdown; count > 0; count -= 1) {
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
    if (!isPlaying && !isArming) return;
    playbackToken += 1;
    isPlaying = false;
    isArming = false;
    root.style.visibility = "visible";
    status = "Playback stopped";
    render();
  }

  function bindPanel(panel) {
    panel.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      const frameElement = event.target.closest("[data-frame-id]");
      if (frameElement && !actionElement && !event.target.closest("input,select")) selectFrame(frameElement.dataset.frameId);
      if (!actionElement) {
        if (sequenceMenuOpen) {
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
      if (action === "seek-selected") seek(state.frames.find((frame) => frame.id === id));
      if (action === "use-current") updateFramePosition(id);
      if (action === "sequence-menu") { sequenceMenuOpen = !sequenceMenuOpen; render(); }
      if (action === "view-frames") { activeView = "frames"; sequenceMenuOpen = false; render(); }
      if (action === "view-setup") { activeView = "setup"; sequenceMenuOpen = false; render(); }
      if (action === "request-clear") { sequenceMenuOpen = false; confirmAction = state.frames.length ? "clear" : null; status = state.frames.length ? status : "No keyframes to clear"; render(); }
      if (action === "request-new") { sequenceMenuOpen = false; confirmAction = "new"; render(); }
      if (action === "request-reset") { sequenceMenuOpen = false; confirmAction = "reset"; render(); }
      if (action === "cancel-confirm") { confirmAction = null; render(); }
      if (action === "confirm-master") performMasterAction();
      if (action === "set-guide") { undoAction = null; state.guidePreset = actionElement.dataset.value; status = "Guide updated"; save(); render(); }
      if (action === "start") start();
      if (action === "resize") resizeViewport();
      if (action === "minimize") { minimized = !minimized; render(); }
      if (action === "hide") root.style.display = "none";
    });

    panel.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      if (!field) return;
      if (field === "loop" || field === "hideWhilePlaying" || field === "reloadBeforeStart") {
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
      setFrameProgress(id, percent, { live: true });
    });

    panel.addEventListener("focusin", (event) => {
      const id = event.target.closest("[data-frame-id]")?.dataset.frameId;
      if (id) selectedId = id;
    });

    bindPanelDrag(panel);
    bindPanelResize(panel);
    bindTimelineDrag(panel);
  }

  function bindPanelResize(panel) {
    const MIN_WIDTH = 340;
    const MIN_HEIGHT = 240;
    panel.querySelectorAll("[data-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const direction = handle.dataset.resize;
        const rect = panel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const affectsHeight = direction.includes("n") || direction.includes("s");
        const statusElement = panel.querySelector(".status");

        // Re-anchor to left/top so dragging either edge of an axis behaves the same.
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        if (affectsHeight) {
          panel.style.height = `${rect.height}px`;
          panel.style.maxHeight = "none";
        }
        panel.classList.add("resizing");
        handle.setPointerCapture(event.pointerId);

        const maxWidth = window.innerWidth - 16;
        const maxHeight = window.innerHeight - 16;

        const resize = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (direction.includes("e")) {
            panel.style.width = `${clamp(rect.width + dx, MIN_WIDTH, maxWidth)}px`;
          }
          if (direction.includes("w")) {
            const width = clamp(rect.width - dx, MIN_WIDTH, Math.min(maxWidth, rect.right - 8));
            panel.style.width = `${width}px`;
            panel.style.left = `${rect.right - width}px`;
          }
          if (direction.includes("s")) {
            panel.style.height = `${clamp(rect.height + dy, MIN_HEIGHT, maxHeight)}px`;
          }
          if (direction.includes("n")) {
            const height = clamp(rect.height - dy, MIN_HEIGHT, Math.min(maxHeight, rect.bottom - 8));
            panel.style.height = `${height}px`;
            panel.style.top = `${rect.bottom - height}px`;
          }
          if (statusElement) statusElement.textContent = `${Math.round(panel.offsetWidth)} × ${Math.round(panel.offsetHeight)}`;
        };

        const finish = () => {
          handle.removeEventListener("pointermove", resize);
          panel.classList.remove("resizing");
          const final = panel.getBoundingClientRect();
          panelPosition = { left: final.left, top: final.top };
          state.panelSize = {
            width: Math.round(final.width),
            height: affectsHeight ? Math.round(final.height) : state.panelSize?.height ?? null
          };
          status = `Panel ${Math.round(final.width)} × ${Math.round(final.height)}`;
          if (statusElement) statusElement.textContent = status;
          save();
        };

        handle.addEventListener("pointermove", resize);
        handle.addEventListener("pointerup", finish, { once: true });
        handle.addEventListener("pointercancel", finish, { once: true });
      });
    });
  }

  function bindTimelineDrag(panel) {
    const ruler = panel.querySelector(".timeline-ruler");
    if (!ruler) return;
    let scrubbing = false;
    const update = (event) => {
      const rect = ruler.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      scrubToTime(progress * totalDuration());
    };
    ruler.addEventListener("pointerdown", (event) => {
      if (isPlaying) return;
      scrubbing = true;
      ruler.setPointerCapture(event.pointerId);
      update(event);
    });
    ruler.addEventListener("pointermove", (event) => {
      if (scrubbing) update(event);
    });
    ruler.addEventListener("pointerup", () => { scrubbing = false; });
    ruler.addEventListener("pointercancel", () => { scrubbing = false; });

    bindClipHandles(panel);
    bindClipReorder(panel);
  }

  // Drag a clip along the lane to change its place in the sequence. The lane is
  // reordered live in the DOM so the drag reads as direct manipulation; state is
  // rebuilt from that order on drop.
  function bindClipReorder(panel) {
    const lane = panel.querySelector(".timeline-lane");
    if (!lane) return;

    lane.addEventListener("pointerdown", (event) => {
      if (isPlaying || event.button !== 0) return;
      if (event.target.closest(".clip-handle")) return; // retiming owns the handles
      const clip = event.target.closest(".clip");
      if (!clip || state.frames.length < 2) return;
      const frameId = clip.dataset.frameId;
      if (!state.frames.some((frame) => frame.id === frameId)) return;

      const startX = event.clientX;
      const clips = () => [...lane.querySelectorAll(".clip")];
      let dragging = false;
      clip.setPointerCapture(event.pointerId);

      const relabel = () => {
        clips().forEach((element, index) => {
          const number = element.querySelector(".clip-label b");
          if (number) number.textContent = index + 1;
        });
      };

      const apply = (moveEvent) => {
        if (!dragging) {
          // Tolerance so a plain click still selects rather than reorders.
          if (Math.abs(moveEvent.clientX - startX) < 4) return;
          dragging = true;
          lane.classList.add("reordering");
          clip.classList.add("dragging");
          selectedId = frameId;
          clips().forEach((element) => element.classList.toggle("selected", element === clip));
        }
        const siblings = clips().filter((element) => element !== clip);
        let target = 0;
        for (const sibling of siblings) {
          const rect = sibling.getBoundingClientRect();
          if (moveEvent.clientX > rect.left + rect.width / 2) target += 1;
        }
        if (target === clips().indexOf(clip)) return;
        lane.insertBefore(clip, siblings[target] ?? null);
        relabel();
      };

      const finish = () => {
        clip.removeEventListener("pointermove", apply);
        if (!dragging) return;
        const order = clips().map((element) => element.dataset.frameId);
        undoAction = null;
        state.frames.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        timelineTimeMs = 0;
        status = "Order updated";
        save();
        render();
      };

      clip.addEventListener("pointermove", apply);
      clip.addEventListener("pointerup", finish, { once: true });
      clip.addEventListener("pointercancel", finish, { once: true });
    });
  }

  function bindClipHandles(panel) {
    const lane = panel.querySelector(".timeline-lane");
    if (!lane) return;

    lane.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest(".clip-handle");
      if (!handle || isPlaying) return;
      const clip = handle.closest(".clip");
      const frame = state.frames.find((item) => item.id === clip?.dataset.frameId);
      if (!frame) return;
      event.preventDefault();
      event.stopPropagation();

      const kind = handle.dataset.handle;
      const label = kind === "travel" ? "Travel" : "Hold";
      const travelElement = clip.querySelector(".clip-travel");
      const holdElement = clip.querySelector(".clip-hold");
      const readout = panel.querySelector(".timeline-time");
      const inspectorField = panel.querySelector(`.inspector[data-frame-id="${frame.id}"] [data-field="${kind}"]`);

      // Fix the pixel-to-time scale at drag start so the value tracks the cursor
      // linearly, even though the lane renormalises as the total duration changes.
      const msPerPx = Math.max(1, totalDuration()) / Math.max(1, lane.clientWidth);
      const startX = event.clientX;
      const startValue = kind === "travel" ? frame.travelMs : frame.holdMs;

      selectedId = frame.id;
      lane.querySelectorAll(".clip.selected").forEach((element) => element.classList.remove("selected"));
      clip.classList.add("selected");
      handle.classList.add("active");
      handle.setPointerCapture(event.pointerId);

      const apply = (moveEvent) => {
        const step = moveEvent.shiftKey ? 10 : 50;
        const raw = startValue + (moveEvent.clientX - startX) * msPerPx;
        const value = Math.max(0, Math.min(60000, Math.round(raw / step) * step));
        if (kind === "travel") frame.travelMs = value;
        else frame.holdMs = value;
        travelElement.style.flexGrow = frame.travelMs;
        holdElement.style.flexGrow = frame.holdMs;
        clip.style.flexGrow = Math.max(1, frame.travelMs + frame.holdMs);
        if (readout) readout.textContent = `${label} ${formatDuration(value)}`;
        if (inspectorField) inspectorField.value = value / 1000;
      };

      const finish = () => {
        handle.removeEventListener("pointermove", apply);
        handle.classList.remove("active");
        undoAction = null;
        state.pacingPreset = "custom";
        timelineTimeMs = Math.min(timelineTimeMs, totalDuration());
        status = `${label} · ${formatDuration(kind === "travel" ? frame.travelMs : frame.holdMs)}`;
        save();
        render();
      };

      handle.addEventListener("pointermove", apply);
      handle.addEventListener("pointerup", finish, { once: true });
      handle.addEventListener("pointercancel", finish, { once: true });
    });
  }

  function bindPanelDrag(panel) {
    const header = panel.querySelector(".header");
    let drag = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button") || event.target.closest("[data-resize]")) return;
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
    if (isPlaying || isArming) {
      stop();
      root.style.display = "block";
      root.style.visibility = "visible";
      return;
    }
    root.style.visibility = "visible";
    const showing = root.style.display === "none";
    root.style.display = showing ? "block" : "none";
    if (showing) {
      introPlayed = false;
      render();
    }
  }

  function handleCommand(command) {
    if (!loaded) {
      queuedCommand = command;
      return;
    }
    if (command === "add-keyframe") addFrame();
    if (command === "play-sequence") {
      root.style.display = "block";
      start();
    }
    // Sent by the background script after it has already reloaded the tab. It
    // arrives twice — once via the injected autoplay attribute and once as a
    // message — so only the first one may act.
    if (command === "reload-play") {
      if (autoplayHandled) return;
      autoplayHandled = true;
      play({ stealth: true, skipCountdown: true });
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape" && (isPlaying || isArming)) {
      event.preventDefault();
      stop();
      return;
    }
    if (event.altKey && event.shiftKey && event.code === "KeyP") {
      event.preventDefault();
      root.style.display = "block";
      start();
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
