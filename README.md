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

1. Choose a desktop, laptop, tablet, or mobile viewport under **Recording setup**, then select **Resize**.
2. Optionally enable a 16:9, 4:5, 9:16, or 1:1 safe crop guide while composing the page.
3. Scroll to the first desired section and choose **Add current position**. Repeat for the remaining sections.
4. Apply a pacing preset or adjust each frame's travel time, hold time, and easing manually.
5. Drag frames by their six-dot handles to reorder them. Use the `•••` menu to update, duplicate, or delete a frame; deletion can be undone.
6. Scrub the timeline to preview intermediate scroll positions.
7. Start the screen recorder and choose **Reload & play**. Scroller reloads the page so its intro animation is captured, stays invisible, waits through the countdown, and then runs the sequence.
8. Use **Preview** when a page reload is unnecessary. Press `Esc` to stop a loop and restore the panel.

## Editing a keyframe

The default **Frames** view keeps the timeline and keyframe list compact. Select any keyframe to open its inspector:

- Drag the **Position** slider or type an exact percentage to update the keyframe and seek the page immediately.
- Choose **Go to position** to preview its saved location.
- Scroll the page manually and choose **Use current scroll** to replace the saved position.
- Edit the keyframe name, travel time, hold time, and easing from the same inspector.

Recording controls now live in the separate **Setup** view, so they do not add scrolling to the frame editor.

## Sequence controls

Use the **Sequence** menu in the header to:

- Start a new sequence and restore the default recording setup.
- Reset only the recording setup while keeping keyframes.
- Clear all keyframes while preserving the setup.

Destructive actions require confirmation and can be undone immediately.

## Keyboard shortcuts

- `Alt` + `Shift` + `K`: capture the current scroll position.
- `Alt` + `Shift` + `P`: play or stop the sequence.
- `Esc`: stop playback.

Shortcuts can be remapped from `chrome://extensions/shortcuts` if they conflict with another extension or operating-system shortcut.

Timelines are stored locally per origin and pathname. No page data leaves the browser.

## MVP product decisions

- **In-page panel instead of a popup:** Chrome popups close as soon as the page is clicked or scrolled.
- **Relative positions:** keyframes are stored as page progress, so they remain useful when small layout shifts change the document height.
- **Custom animation loop:** playback uses `requestAnimationFrame` rather than native smooth scrolling, allowing predictable duration and easing.
- **Reload resume:** a short-lived session marker lets playback resume automatically after reloading without requesting access to every website.
- **Viewport presets:** the browser window is resized with compensation for Chrome's frame, keeping the requested content viewport accurate.
- **System screen recorder first:** direct tab recording and video export add media permissions and editing complexity that are better evaluated after the scrolling workflow is proven.

## Sensible next steps

- Element-anchored frames for pages whose height changes substantially after load.
- Editable cubic-bezier curves and timeline timestamps.
- Import/export of timelines for collaborators.
- Optional tab capture and WebM export once the core workflow feels right.
