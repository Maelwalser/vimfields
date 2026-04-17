# VimFields Privacy Policy

_Last updated: 2026-04-17_

VimFields is a browser extension that adds Vim keybindings to editable fields in the browser. It runs entirely on your device.

## Data VimFields does not collect

- No analytics, telemetry, crash reports, or usage metrics.
- No personal information, browsing history, form contents, or keystrokes leave your browser.
- No network requests are made by the extension to any server.

## Data VimFields stores locally

All data is stored in `chrome.storage.sync`, which Chrome replicates across browsers where you are signed in. Nothing is sent to the extension author.

The stored configuration contains only:

- Whether VimFields is enabled (`true` / `false`).
- Your configured escape remap (e.g. `jk`).
- Your list of disabled sites (e.g. `example.com`, `*.example.com`).

## Browser permissions

| Permission                     | Why it is requested                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `storage`                      | Persist your settings via `chrome.storage.sync`.                                                     |
| `activeTab`                    | Read the hostname of the active tab when you click the popup, so we can offer "Disable here".        |
| `clipboardRead`, `clipboardWrite` | Let Vim's `y` (yank) and `p` (paste) round-trip through the system clipboard.                    |
| `<all_urls>` (content script)  | Inject Vim keybindings into editable fields on any page. Content remains on your device.             |

The content script only interacts with text fields that are currently focused. It never reads page content proactively and never transmits it anywhere.

## Clipboard access

When you yank (`y`) inside an editable field, the selected text is written to the system clipboard so it can be pasted elsewhere. When you paste (`p` / `P`), the clipboard is read once to keep the unnamed register in sync. The clipboard is never inspected at any other time and its contents are never sent off-device.

## Changes

Any change to this policy will be published in this file and in the extension's release notes.

## Contact

Open an issue in the extension's public repository for questions or concerns.
