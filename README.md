# VimFields

Vim keybindings for every editable field in your browser — `<input>`, `<textarea>`, and `contenteditable` elements, including inside shadow DOM.

## Features

- Modal editing (normal / insert / visual / visual-line) in every text field.
- Motions: `h j k l w b e 0 $ ^ gg G f{char} t{char}`.
- Operators: `d c y` with any motion, plus `x X r{char} p P J u`.
- Visual and visual-line selection with `v` / `V`, extendable with any motion.
- System clipboard: `y` and `p` round-trip through the OS clipboard so yanks work across tabs and apps.
- Configurable escape remap (default `jk`).
- Per-site opt-out list with subdomain and wildcard support.
- Global toggle via `Alt+V` or the popup.

## Install

### From source (unpacked)

```bash
git clone https://github.com/<you>/vimfields.git
cd vimfields
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repository root (not `dist/`).

The `manifest.json` at the root references `dist/`, so `npm run build` must run first.

### Package for the Chrome Web Store

```bash
npm run package
```

Produces `vimfields-<version>.zip` in the project root, ready to upload to the Web Store dashboard.

## Usage

Focus any text field and start typing — VimFields begins in **insert** mode so the page behaves exactly as it would without the extension. Press `Esc` (or your configured remap, default `jk`) to enter normal mode and use Vim motions and operators.

### Keybindings

| Mode            | Keys                                                                 |
| --------------- | -------------------------------------------------------------------- |
| Enter insert    | `i` `a` `I` `A` `o` `O`                                              |
| Exit insert     | `Esc`, `Ctrl+C`, or escape remap (default `jk`)                      |
| Motions         | `h j k l w b e 0 $ ^ gg G f{char} t{char}`                           |
| Operators       | `d c y` + any motion, `dd` / `cc` / `yy` for linewise                |
| Edits           | `x` `X` `r{char}` `p` `P` `J` `u`                                    |
| Visual          | `v` (char), `V` (line); any motion extends the selection             |
| Registers       | Unnamed register synced with system clipboard                        |

### Escape remap

Change the insert-mode escape sequence in the popup. Set to any 1–4 character sequence (e.g. `jk`, `jj`, `kj`). The first character is typed into the field first and removed when the sequence completes — just like Vim's `inoremap jk <Esc>`.

### Disabling on a site

Open the popup and either:

- Click **Disable here** to toggle the currently active tab's hostname, or
- Type a pattern in the input and press **Add**.

Patterns:

| Pattern            | Matches                                                       |
| ------------------ | ------------------------------------------------------------- |
| `example.com`      | `example.com` and every subdomain (`mail.example.com`, …)     |
| `*.example.com`    | Subdomains only — does **not** match `example.com` itself     |
| `mail.example.com` | That exact host and deeper subdomains (`team.mail.example.com`) |

URLs are accepted — `https://mail.google.com/inbox` is reduced to `mail.google.com` automatically. Leading `www.` is stripped.

## Development

```bash
npm run watch          # Rebuild on change (unminified, source maps)
npm run typecheck      # tsc --noEmit
npm test               # Run all vitest tests once
npm run test:watch     # Vitest in watch mode
npm run test:dom       # Run only the jsdom-environment tests
```

Load the unpacked extension from the repo root, then reload it from `chrome://extensions` after each rebuild.

## Privacy

VimFields runs entirely locally — no network requests, no telemetry, no analytics. See [PRIVACY.md](./PRIVACY.md) for the full statement of what the extension stores and why.

## License

[MIT](./LICENSE)
