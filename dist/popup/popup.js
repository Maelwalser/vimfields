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

// ../home/mael/Personal/vimfields/.phantom/overlays/fixing/mount/popup/popup.ts
var enabledToggle = document.getElementById(
  "enabled-toggle"
);
var escapeRemapInput = document.getElementById(
  "escape-remap"
);
var disabledSitesTextarea = document.getElementById(
  "disabled-sites"
);
var statusEl = document.getElementById("status");
var saveTimeout = null;
function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 1500);
}
function buildConfig() {
  const sites = disabledSitesTextarea.value.split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    enabled: enabledToggle.checked,
    escapeRemap: escapeRemapInput.value.trim() || DEFAULT_CONFIG.escapeRemap,
    disabledSites: sites
  };
}
function scheduleConfigSave() {
  if (saveTimeout != null) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const config = buildConfig();
    chrome.runtime.sendMessage({
      type: "config-updated" /* ConfigUpdated */,
      payload: config
    });
    showStatus("Saved");
  }, 400);
}
function populateUI(config) {
  enabledToggle.checked = config.enabled;
  escapeRemapInput.value = config.escapeRemap;
  disabledSitesTextarea.value = config.disabledSites.join("\n");
}
async function init() {
  const config = await chrome.runtime.sendMessage({ type: "get-config" /* GetConfig */ });
  populateUI(config ?? { ...DEFAULT_CONFIG });
  enabledToggle.addEventListener("change", () => {
    scheduleConfigSave();
    showStatus(enabledToggle.checked ? "Enabled" : "Disabled");
  });
  escapeRemapInput.addEventListener("input", scheduleConfigSave);
  disabledSitesTextarea.addEventListener("input", scheduleConfigSave);
}
init();
//# sourceMappingURL=popup.js.map
