// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/constants.ts
var MODE_NAMES = {
  ["normal" /* Normal */]: "NORMAL",
  ["insert" /* Insert */]: "INSERT",
  ["visual" /* Visual */]: "VISUAL",
  ["visual-line" /* VisualLine */]: "V-LINE"
};
var DEFAULT_CONFIG = {
  enabled: true,
  escapeRemap: "jk",
  disabledSites: []
};
var STORAGE_KEYS = {
  config: "vimfields-config",
  enabled: "vimfields-enabled"
};

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/src/background.ts
async function getConfig() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.config);
  return result[STORAGE_KEYS.config] ?? { ...DEFAULT_CONFIG };
}
async function saveConfig(config) {
  await chrome.storage.sync.set({ [STORAGE_KEYS.config]: config });
}
async function isEnabled() {
  const config = await getConfig();
  return config.enabled;
}
async function toggleEnabled() {
  const config = await getConfig();
  config.enabled = !config.enabled;
  await saveConfig(config);
  return config.enabled;
}
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-vimfields") {
    const enabled = await toggleEnabled();
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, {
        type: "toggle-enabled" /* ToggleEnabled */,
        payload: { enabled }
      });
    }
  }
});
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    switch (message.type) {
      case "get-config" /* GetConfig */: {
        getConfig().then((config) => sendResponse(config));
        return true;
      }
      case "config-updated" /* ConfigUpdated */: {
        const config = message.payload;
        saveConfig(config).then(() => {
          broadcastToContentScripts({
            type: "config-updated" /* ConfigUpdated */,
            payload: config
          });
          sendResponse({ ok: true });
        });
        return true;
      }
      case "toggle-enabled" /* ToggleEnabled */: {
        toggleEnabled().then((enabled) => {
          broadcastToContentScripts({
            type: "toggle-enabled" /* ToggleEnabled */,
            payload: { enabled }
          });
          sendResponse({ enabled });
        });
        return true;
      }
      case "get-state" /* GetState */: {
        isEnabled().then((enabled) => sendResponse({ enabled }));
        return true;
      }
    }
    return false;
  }
);
async function broadcastToContentScripts(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
      });
    }
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(STORAGE_KEYS.config);
  if (existing[STORAGE_KEYS.config] == null) {
    await saveConfig({ ...DEFAULT_CONFIG });
  }
});
//# sourceMappingURL=background.js.map
