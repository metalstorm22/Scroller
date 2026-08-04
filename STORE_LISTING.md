# Chrome Web Store listing

Release: 0.3.1

## Product details

**Name**  
Scroller — Keyframe Page Scrolls

**Summary**  
Create and replay smooth, timed scroll sequences for polished website recordings.

**Category**  
Productivity

**Language**  
English

## Detailed description

Create polished, repeatable webpage scrolls without editing motion by hand.

Scroller adds a compact keyframe timeline to the current page. Capture the sections you want to show, set how long each scroll and pause should take, choose an easing style, and play the finished sequence while recording your screen.

Use Scroller for:

- Product demos and launch videos
- Website walkthroughs
- Portfolio recordings
- Tutorials and presentations
- Social clips in landscape, portrait, square, or 4:5 formats

Highlights:

- Capture and reorder scroll keyframes
- Edit travel and hold timing on a visual timeline
- Preview, scrub, loop, or reload and play a sequence
- Resize to desktop, laptop, tablet, and mobile viewports
- Show safe crop guides for common video aspect ratios
- Save separate timelines for each page
- Use keyboard shortcuts for fast capture and playback

Private by design: Scroller has no account, analytics, ads, or server. The current page address, your timelines, and preferences stay in Chrome on your device and are not transmitted. The extension only accesses a page after you explicitly activate it.

Note: Chrome blocks extensions on browser-owned pages, including the Chrome Web Store and `chrome://` pages.

## Privacy practices

**Single purpose**  
Scroller lets users design and replay timed webpage scrolling sequences for screen recordings.

**Data usage disclosure**  
Scroller handles the following information locally and only for its disclosed keyframe and playback features:

- **Web history:** the active page's origin and path, used to save and restore the correct timeline for that page.
- **User activity:** user-created scroll positions, timing values, and extension interface preferences.

Select **Web history** and **User activity** in the Privacy practices data-type checklist. No user data is transmitted, sold, shared, used for advertising, or used for purposes unrelated to Scroller's single purpose. Complete all applicable Limited Use certifications.

**Remote code**  
No. All executable code is included in the extension package.

**Privacy policy URL**  
Use the public GitHub URL after this file is pushed:
`https://github.com/metalstorm22/Scroller/blob/main/PRIVACY.md`

## Permission justifications

**activeTab**  
Provides temporary access to the current page only after the user selects Scroller or invokes its keyboard shortcut. This is required to read and change the page's scroll position during keyframe capture and playback.

**scripting**  
Injects Scroller's packaged interface and playback logic into the active tab after an explicit user action. Scroller does not inject remote code.

**storage**  
Stores user-created keyframes, timing settings, viewport choices, and panel preferences locally. Session storage also carries a short-lived playback request across a user-initiated page reload.

## Store assets checklist

- [x] 128 × 128 extension icon: `icons/icon-128.png`
- [x] 1280 × 800 screenshot: `store-assets/screenshots/scroller-store-1280x800.png`
- [x] 440 × 280 small promotional tile: `store-assets/promotional/scroller-small-promo-440x280.png`
- [ ] Optional 1400 × 560 marquee promotional tile
- [ ] Public privacy policy URL verified after pushing to GitHub
- [ ] Support URL set to `https://github.com/metalstorm22/Scroller/issues`
- [ ] Store listing reviewed and submitted
