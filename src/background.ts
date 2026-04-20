import { MessageType, type ExtensionMessage, type VimConfig } from "./types";
import { DEFAULT_CONFIG, STORAGE_KEYS } from "./constants";

async function getConfig(): Promise<VimConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.config);
  const stored = result[STORAGE_KEYS.config] as Partial<VimConfig> | undefined;
  return { ...DEFAULT_CONFIG, ...(stored ?? {}) };
}

async function saveConfig(config: VimConfig): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.config]: config });
}

async function isEnabled(): Promise<boolean> {
  const config = await getConfig();
  return config.enabled;
}

async function toggleEnabled(): Promise<boolean> {
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
      currentWindow: true,
    });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, {
        type: MessageType.ToggleEnabled,
        payload: { enabled },
      });
    }
  }
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case MessageType.GetConfig: {
        getConfig().then((config) => sendResponse(config));
        return true;
      }
      case MessageType.ConfigUpdated: {
        const config = message.payload as VimConfig;
        saveConfig(config).then(() => {
          broadcastToContentScripts({
            type: MessageType.ConfigUpdated,
            payload: config,
          });
          sendResponse({ ok: true });
        });
        return true;
      }
      case MessageType.ToggleEnabled: {
        toggleEnabled().then((enabled) => {
          broadcastToContentScripts({
            type: MessageType.ToggleEnabled,
            payload: { enabled },
          });
          sendResponse({ enabled });
        });
        return true;
      }
      case MessageType.GetState: {
        isEnabled().then((enabled) => sendResponse({ enabled }));
        return true;
      }
    }
    return false;
  },
);

async function broadcastToContentScripts(
  message: ExtensionMessage,
): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab may not have the content script loaded — ignore
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
