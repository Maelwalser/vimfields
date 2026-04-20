import { MessageType, type VimConfig } from "../src/types";
import { DEFAULT_CONFIG } from "../src/constants";
import {
  normalizeSitePattern,
  matchesSite,
} from "../src/dom/site-matcher";

const enabledToggle = document.getElementById(
  "enabled-toggle",
) as HTMLInputElement;
const escapeRemapInput = document.getElementById(
  "escape-remap",
) as HTMLInputElement;
const monospaceToggle = document.getElementById(
  "monospace-toggle",
) as HTMLInputElement;
const chipList = document.getElementById(
  "disabled-sites-list",
) as HTMLUListElement;
const addForm = document.getElementById("add-form") as HTMLFormElement;
const addInput = document.getElementById("add-input") as HTMLInputElement;
const currentSiteRow = document.getElementById(
  "current-site-row",
) as HTMLDivElement;
const currentSiteHost = document.getElementById(
  "current-site-host",
) as HTMLSpanElement;
const currentSiteBtn = document.getElementById(
  "current-site-btn",
) as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;

let config: VimConfig = { ...DEFAULT_CONFIG };
let currentHost = "";
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function showStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  statusEl.classList.toggle("error", isError);
  if (statusTimeout != null) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.classList.remove("visible");
  }, 1500);
}

function persist(nextConfig: VimConfig): void {
  config = nextConfig;
  if (saveTimeout != null) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    chrome.runtime.sendMessage({
      type: MessageType.ConfigUpdated,
      payload: config,
    });
    showStatus("Saved");
  }, 200);
}

function renderChips(): void {
  chipList.replaceChildren();

  if (config.disabledSites.length === 0) {
    const empty = document.createElement("li");
    empty.className = "chip-empty";
    empty.textContent = "No sites disabled yet.";
    chipList.appendChild(empty);
    return;
  }

  for (const site of config.disabledSites) {
    const li = document.createElement("li");
    li.className = "chip";

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = site;
    li.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chip-remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove ${site}`);
    removeBtn.addEventListener("click", () => removeSite(site));
    li.appendChild(removeBtn);

    chipList.appendChild(li);
  }
}

function renderCurrentSite(): void {
  if (!currentHost) {
    currentSiteRow.hidden = true;
    return;
  }
  currentSiteRow.hidden = false;
  currentSiteHost.textContent = currentHost;

  const isDisabled = config.disabledSites.some((p) =>
    matchesSite(currentHost, p),
  );
  currentSiteHost.classList.toggle("disabled", isDisabled);
  currentSiteBtn.textContent = isDisabled ? "Enable here" : "Disable here";
}

function render(): void {
  enabledToggle.checked = config.enabled;
  escapeRemapInput.value = config.escapeRemap;
  monospaceToggle.checked = config.useMonospaceFont;
  renderChips();
  renderCurrentSite();
}

function addSite(raw: string): void {
  const pattern = normalizeSitePattern(raw);
  if (!pattern) {
    showStatus("Invalid site pattern", true);
    return;
  }
  if (config.disabledSites.includes(pattern)) {
    showStatus("Already in the list");
    return;
  }
  persist({
    ...config,
    disabledSites: [...config.disabledSites, pattern],
  });
  render();
}

function removeSite(pattern: string): void {
  persist({
    ...config,
    disabledSites: config.disabledSites.filter((p) => p !== pattern),
  });
  render();
}

function toggleCurrentSite(): void {
  if (!currentHost) return;
  const match = config.disabledSites.find((p) =>
    matchesSite(currentHost, p),
  );
  if (match) {
    removeSite(match);
  } else {
    addSite(currentHost);
  }
}

async function loadCurrentHost(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url) return;
    const host = normalizeSitePattern(tab.url);
    if (host) currentHost = host;
  } catch {
    // activeTab permission may not yet be granted — ignore
  }
}

async function loadConfig(): Promise<void> {
  const saved = await chrome.runtime.sendMessage<
    { type: MessageType },
    VimConfig | undefined
  >({ type: MessageType.GetConfig });
  config = saved ?? { ...DEFAULT_CONFIG };
}

async function init(): Promise<void> {
  await Promise.all([loadConfig(), loadCurrentHost()]);
  render();

  enabledToggle.addEventListener("change", () => {
    persist({ ...config, enabled: enabledToggle.checked });
    showStatus(enabledToggle.checked ? "Enabled" : "Disabled");
  });

  escapeRemapInput.addEventListener("input", () => {
    const value =
      escapeRemapInput.value.trim() || DEFAULT_CONFIG.escapeRemap;
    persist({ ...config, escapeRemap: value });
  });

  monospaceToggle.addEventListener("change", () => {
    persist({ ...config, useMonospaceFont: monospaceToggle.checked });
  });

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = addInput.value;
    if (!raw.trim()) return;
    addSite(raw);
    addInput.value = "";
    addInput.focus();
  });

  currentSiteBtn.addEventListener("click", toggleCurrentSite);
}

init();
