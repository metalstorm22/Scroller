# Scroller

Scroller is a small Chrome extension for designing repeatable, cinematic webpage scrolls. Capture positions on any live page, assign travel and hold timing, choose an easing curve, then play the sequence once or on a loop while screen recording.

The extension icon uses a three-node eased path to represent scroll keyframes and motion timing.

## Install the prototype

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a normal website and click the Scroller toolbar icon.

Chrome prevents extensions from running on protected browser pages such as `chrome://extensions` and the Chrome Web Store.

## Recording workflow

1. Set the browser and site to the final recording viewport.
2. Scroll to the first desired section and choose **Add current position**.
3. Repeat for the remaining sections.
4. Adjust each frame's travel time, hold time, and easing.
5. Drag frames by their six-dot handles to reorder them.
6. Enable **Loop** and **Hide on play** as needed.
7. Start the screen recorder, then choose **Play sequence**. Playback begins after a three-second countdown.
8. Press `Esc` to stop a loop and restore the panel.

Timelines are stored locally per origin and pathname. No page data leaves the browser.

## MVP product decisions

- **In-page panel instead of a popup:** Chrome popups close as soon as the page is clicked or scrolled.
- **Relative positions:** keyframes are stored as page progress, so they remain useful when small layout shifts change the document height.
- **Custom animation loop:** playback uses `requestAnimationFrame` rather than native smooth scrolling, allowing predictable duration and easing.
- **System screen recorder first:** direct tab recording and video export add media permissions and editing complexity that are better evaluated after the scrolling workflow is proven.

## Sensible next steps

- Element-anchored frames for pages whose height changes substantially after load.
- A compact timeline with explicit timestamps and curve editing.
- Presets for common pacing styles: editorial, product tour, and slow cinematic.
- Import/export of timelines for collaborators.
- Optional tab capture and WebM export once the core workflow feels right.
