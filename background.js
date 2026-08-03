chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch (error) {
    console.warn("Scroller cannot run on this page.", error);
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#ff6658" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
  }
});
