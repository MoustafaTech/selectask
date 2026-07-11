<p align="center"><img src="assets/logo-badge.svg" width="80" alt="Rex logo" /></p>
<h1 align="center">Rex — select text, tap Ctrl, ask</h1>
<p align="center"><b>The quick answer, without losing your thread.</b></p>

<p align="center"><img src="assets/rex-demo.gif" width="760" alt="A code line gets selected in a long AI chat and Rex explains it in place" /></p>

You're deep in a long AI chat, a dense article, or someone else's code — and one line stops you. Opening a new chat means losing your focus.

**Rex (your assistant)**: select the thing, tap `Ctrl`, ask — the answer lands right where you are.

Open source, your own API key, straight to your provider. No server, no account.

## Install

**[⬇ Download the latest release](https://github.com/MoustafaTech/rex/releases/latest)**, then follow your OS:

<details>
<summary><b>🍎 macOS</b></summary>

1. Download `Rex-…-mac-arm64.dmg` (Apple Silicon) or `Rex-…-mac-x64.dmg` (Intel) and drag **Rex** to Applications.
2. First open: double-clicking shows a blocked dialog (Rex is unsigned) — click **Done**, then go to **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to Rex and confirm. *(macOS 14 or older: right-click the app → Open → Open.)*
3. Grant **Accessibility** when asked (System Settings → Privacy & Security → Accessibility → enable Rex) — this lets Rex hear the `Ctrl` tap.
4. macOS will also ask to let Rex control **System Events** — click OK (that's how Rex reads your selection). Then quit and reopen Rex once.
5. Rex lives in the **menu bar** (no Dock icon).
</details>

<details>
<summary><b>🪟 Windows</b></summary>

1. Download and run `Rex-…-win-x64.exe`.
2. SmartScreen will warn (unsigned) — click **More info → Run anyway**.
3. Rex lives in the **system tray**, near the clock.
</details>

<details>
<summary><b>🐧 Linux</b></summary>

```bash
# AppImage (any distro)
chmod +x Rex-…-linux-x86_64.AppImage && ./Rex-…-linux-x86_64.AppImage
# or Debian/Ubuntu
sudo dpkg -i Rex-…-linux-amd64.deb && rex
```

Install the clipboard helpers — they make capture direct and safe: `sudo apt install xclip xdotool` (X11) or `sudo apt install wl-clipboard` (Wayland). Rex lives in the **system tray**.
</details>

### Add your API key

Tray/menu-bar icon → **Settings** → pick a provider, paste a key, set a model:

| Provider | Example models |
|---|---|
| Anthropic | `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| OpenAI | `gpt-5.2`, `gpt-5-mini` |
| Google | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Mistral | `mistral-small-latest`, `mistral-large-latest` |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` |
| xAI | `grok-4`, `grok-3-mini` |
| Groq | `llama-3.3-70b-versatile` |
| OpenRouter | `anthropic/claude-sonnet-5` — any model on the router |
| Ollama (local) | `llama3.3`, `qwen3` — no API key needed |
| OpenAI-compatible | anything with a base URL: LM Studio, vLLM, llama.cpp… |

The base URL field only appears for the OpenAI-compatible option (e.g. `http://localhost:1234/v1`). A mistyped model shows the provider's error right in the popup — fix it in Settings and re-ask.

## Use

1. **Select text** anywhere → **tap `Ctrl`** on its own (`Ctrl+C`, `Ctrl+click`… never trigger it). Nothing selected? **Double-tap `Ctrl`** and Rex opens anyway, ready to ask — a bare `Ctrl` tap is the one gesture that does nothing else on macOS, Windows, or Linux.
2. **Ask.** Answers come back short and summarized — say "explain in detail" when you want more. Follow up in the same chat.
3. **Change or add context without retapping**: while Rex is open, drag-select different text — the pending context updates live. Tap `Ctrl` to pin it and stack another selection into the same conversation.
4. `Esc` or ✕ closes (it never closes on its own). Drag any edge to resize.

**Fully keyboard-drivable**: `Esc` backs out of settings, then closes · `Ctrl/⌘` + `,` opens settings · `Tab` moves around · `Enter` saves · `/` jumps to the ask box. The full list lives in Settings.

**Extras**: light/dark theme follows your system (or pick in Settings — light is the dino's day run ☀️, dark is the night run 🌙) · the dino sprints while answers stream · `Space` makes him jump · your high score persists.

## Run from source

```bash
git clone https://github.com/MoustafaTech/rex.git
cd rex && npm install && npm start        # Node 20+, nothing else to install
```

- **macOS**: grant Accessibility and Automation to the app that launches Rex (your terminal or IDE — the prompts name it, not Rex), then restart it.
- **Linux**: install the clipboard helpers listed above.
- Debug logs: `REX_DEBUG=1 npm start` · Build installers: `npm run dist`

## How it works

1. A global listener (`uiohook-napi`) watches for a clean `Ctrl` tap — any other key or mouse activity during the hold cancels it.
2. Your selection is captured via the primary selection on Linux, or a momentary simulated copy elsewhere. Your clipboard — text, formatting, images — is restored immediately; if it holds something Rex can't put back (like copied files), Rex skips the capture rather than lose it.
3. A frameless, resizable, always-on-top popup opens at your cursor and stays until you close it.
4. Questions + selections go **directly from your machine to your provider**, streamed back into the popup.

Config lives in your OS's app-data dir (`~/Library/Application Support/Rex`, `%APPDATA%/Rex`, or `~/.config/Rex`); upgrades from the app's earlier names migrate automatically. The dino is original pixel art — a homage to everyone's favorite offline companion, not a copy.

## Privacy

- API keys live only on your device (config file, `0600` on macOS/Linux; protected by your user profile's permissions on Windows).
- The only network calls are the ones you trigger, straight to your configured provider.
- On macOS/Windows, capture briefly transits the OS clipboard — clipboard-history tools (Win+V history, Alfred, Raycast, Maccy) may retain the selected text, and Windows' "Sync across devices" can sync it. On Linux with the helpers installed, Rex reads the selection directly and skips the clipboard.
- No analytics, no telemetry, no accounts.

## License

[MIT](LICENSE)
