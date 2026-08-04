const PENDING_RELOAD_PREFIX = "scroller-pending-reload:";

async function injectScroller(tabId, { reloadAutoplay = false } = {}) {
  if (reloadAutoplay) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { document.documentElement.setAttribute("data-scroller-reload-autoplay", ""); }
    });
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendScrollerCommand(tabId, command) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SCROLLER_COMMAND", command });
  } catch {
    await injectScroller(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "SCROLLER_COMMAND", command });
  }
}

async function showActionError(tabId, error) {
  console.warn("Scroller cannot run on this page.", error);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff6658" });
  await chrome.action.setBadgeText({ tabId, text: "!" });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await injectScroller(tab.id);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch (error) {
    await showActionError(tab.id, error);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id || !["add-keyframe", "play-sequence"].includes(command)) return;
  try {
    await sendScrollerCommand(tab.id, command);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch (error) {
    await showActionError(tab.id, error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  if (!tabId) return false;

  if (message?.type === "SCROLLER_RELOAD_AND_PLAY") {
    (async () => {
      const key = `${PENDING_RELOAD_PREFIX}${tabId}`;
      await chrome.storage.session.set({ [key]: { createdAt: Date.now() } });
      await chrome.tabs.reload(tabId);
      sendResponse({ ok: true });
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SCROLLER_RESIZE_VIEWPORT" && windowId != null) {
    (async () => {
      const targetWidth = Math.max(320, Number(message.width) || 1440);
      const targetHeight = Math.max(320, Number(message.height) || 900);
      let browserWindow = await chrome.windows.get(windowId);
      if (browserWindow.state !== "normal") {
        browserWindow = await chrome.windows.update(windowId, { state: "normal" });
      }
      const frameWidth = Math.max(0, (browserWindow.width || message.innerWidth) - message.innerWidth);
      const frameHeight = Math.max(0, (browserWindow.height || message.innerHeight) - message.innerHeight);
      const resized = await chrome.windows.update(windowId, {
        width: Math.round(targetWidth + frameWidth),
        height: Math.round(targetHeight + frameHeight)
      });
      sendResponse({ ok: true, width: resized.width, height: resized.height });
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const key = `${PENDING_RELOAD_PREFIX}${tabId}`;
  const result = await chrome.storage.session.get(key);
  const pending = result[key];
  if (!pending) return;
  await chrome.storage.session.remove(key);
  if (Date.now() - pending.createdAt > 30000) return;

  try {
    await injectScroller(tabId, { reloadAutoplay: true });
    await chrome.tabs.sendMessage(tabId, { type: "SCROLLER_COMMAND", command: "reload-play" });
  } catch (error) {
    await showActionError(tabId, error);
  }
});
