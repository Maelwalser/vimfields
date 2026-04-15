import { MessageType, type VimConfig } from "../src/types";
import { DEFAULT_CONFIG } from "../src/constants";

const enabledToggle = document.getElementById(
  "enabled-toggle",
) as HTMLInputElement;
const escapeRemapInput = document.getElementById(
  "escape-remap",
) as HTMLInputElement;
const disabledSitesTextarea = document.getElementById(
  "disabled-sites",
) as HTMLTextAreaElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function showStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 1500);
}

function buildConfig(): VimConfig {
  const sites = disabledSitesTextarea.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    enabled: enabledToggle.checked,
    escapeRemap: escapeRemapInput.value.trim() || DEFAULT_CONFIG.escapeRemap,
    disabledSites: sites,
  };
}

function scheduleConfigSave(): void {
  if (saveTimeout != null) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const config = buildConfig();
    chrome.runtime.sendMessage({
      type: MessageType.ConfigUpdated,
      payload: config,
    });
    showStatus("Saved");
  }, 400);
}

function populateUI(config: VimConfig): void {
  enabledToggle.checked = config.enabled;
  escapeRemapInput.value = config.escapeRemap;
  disabledSitesTextarea.value = config.disabledSites.join("\n");
}

async function init(): Promise<void> {
  const config = await chrome.runtime.sendMessage<
    { type: MessageType },
    VimConfig
  >({ type: MessageType.GetConfig });
  populateUI(config ?? { ...DEFAULT_CONFIG });

  enabledToggle.addEventListener("change", () => {
    scheduleConfigSave();
    showStatus(enabledToggle.checked ? "Enabled" : "Disabled");
  });

  escapeRemapInput.addEventListener("input", scheduleConfigSave);
  disabledSitesTextarea.addEventListener("input", scheduleConfigSave);
}

init();
