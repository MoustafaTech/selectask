<img src="assets/logo-badge.svg" width="72" alt="Rex — a pixel T-Rex" />

# Rex 🦖

**Select text anywhere. Tap `Ctrl`. A little dino fetches you the answer.**

You're reading an article, an AI answer, code, or a scary error message, and one word / line / paragraph needs explaining. Instead of opening a new chat and losing your thread: select it and tap `Ctrl` — a small pixel-world popup opens right where you are — Rex the dino jogging across the top — and a short answer streams in. `Esc`, and you're back to work.

- 🖱️ **Select text, then tap `Ctrl`** (on its own) → a minimal popup opens with your selection as context
- 🦖 Rex runs, hops cacti, and racks up a high score at the top of the popup the whole time — he sprints while your answer streams
- 💬 Answers are short and summarized by default; ask follow-ups in the same popup — markdown and code blocks included
- ➕ **Stack context**: while Rex is open, select more text and tap `Ctrl` again — it joins the same conversation, history intact
- 🔑 **Bring your own API key** — Anthropic (Claude), OpenAI, Google (Gemini), or any OpenAI-compatible endpoint (Ollama, Groq, OpenRouter, LM Studio…)
- 🔒 Keys are stored **only on your device**; requests go **directly to your provider**. No server, no account, no telemetry.
- 🖥️ macOS, Windows, Linux · MIT licensed

---

## Install (prebuilt)

Download from the **[latest release](https://github.com/MoustafaTech/rex/releases/latest)**.

### macOS

1. Download `Rex-x.y.z-mac-arm64.dmg` (Apple Silicon) or `Rex-x.y.z-mac-x64.dmg` (Intel).
2. Open the dmg and drag **Rex** into **Applications**.
3. First launch: the app is unsigned, so **right-click the app → Open → Open** (a plain double-click gets blocked by Gatekeeper).
4. Grant **Accessibility** access when asked (System Settings → Privacy & Security → Accessibility → enable Rex), then quit and reopen. This is what lets the dino hear your `Ctrl` tap and copy your selection.
5. Find the dino in the **menu bar** (there is no Dock icon) → **Settings…** → pick a provider, paste your API key, set a model. Done.

### Windows

1. Download `Rex-x.y.z-win-x64.exe`.
2. Run it. SmartScreen will warn because the binary is unsigned — click **More info → Run anyway**.
3. The installer launches Rex automatically; the dino lives in the **system tray** (bottom-right, near the clock).
4. Tray icon → **Settings…** → provider, API key, model. Done.

### Linux

**AppImage (any distro):**

```bash
chmod +x Rex-x.y.z-linux-x86_64.AppImage
./Rex-x.y.z-linux-x86_64.AppImage
```

**Debian / Ubuntu (.deb):**

```bash
sudo dpkg -i Rex-x.y.z-linux-amd64.deb
rex
```

For the smoothest selection capture install the clipboard helpers:

```bash
# X11
sudo apt install xclip xdotool
# Wayland
sudo apt install wl-clipboard
```

The dino sits in your **system tray**. Tray icon → **Settings…** → provider, API key, model. Done.

---

## Run from source

Requirements: [Node.js](https://nodejs.org) 20+ and git — that's it on every OS (native input hooks ship as prebuilt binaries, no compiler needed).

```bash
git clone https://github.com/MoustafaTech/rex.git
cd rex
npm install
npm start
```

Per-OS notes:

- **macOS**: on first `npm start`, grant Accessibility access to the app that launched it (System Settings → Privacy & Security → Accessibility), then restart it. Without this the `Ctrl` gestures can't be detected.
- **Windows**: no extra steps. If the popup doesn't appear, check the tray for the dino.
- **Linux**: install `xclip` + `xdotool` (X11) or `wl-clipboard` (Wayland) as above. On Wayland, selection capture uses the primary selection.

Debug mode (prints every trigger and capture to the terminal):

```bash
REX_DEBUG=1 npm start
```

Build installers for your current OS into `release/`:

```bash
npm run dist
```

---

## Usage

1. **Select** any text in any app — browser, editor, PDF, terminal.
2. **Tap `Ctrl`** once, on its own. (A tap "spoils" if you press any other key or use the mouse while `Ctrl` is down, so `Ctrl+C` / `Ctrl+click` never open the popup.)
3. The popup opens at your cursor. **Type your question**, press `Enter`, and watch Rex sprint while the answer streams in.
4. **Keep going**: while Rex is open, select more text anywhere and tap `Ctrl` again — the new selection joins the conversation as extra context, and Rex remembers everything discussed so far.
5. The popup stays open (and resizable — drag any edge) until you press **`Esc`** or click its ✕.

## Configuration

Open **Settings** from the popup's gear icon or the tray menu.

| Provider | Example models | Base URL |
|---|---|---|
| Anthropic | `claude-sonnet-5`, `claude-haiku-4-5-20251001` | — |
| OpenAI | `gpt-5.2`, `gpt-5-mini` | — |
| Google | `gemini-2.5-flash`, `gemini-2.5-pro` | — |
| OpenAI-compatible | Ollama `llama3.3`, Groq, OpenRouter, LM Studio, vLLM… | e.g. `http://localhost:11434/v1` |

**Base URL** is only needed for the OpenAI-compatible option — leave it empty otherwise. If you mistype a model name the popup shows the provider's error inline; fix it in Settings and re-ask.

Config lives in the standard per-user app-data dir (`~/Library/Application Support/Rex` on macOS, `%APPDATA%/Rex` on Windows, `~/.config/Rex` on Linux), permissions `0600`. Upgrading from the app's earlier lives as *SelectAsk* or *Rexplain*? Your config is migrated automatically on first launch.

## How it works

1. A global input listener (`uiohook-napi`) watches for a clean `Ctrl` tap — no other key or mouse activity during the hold.
2. Your selection is captured via the primary selection on Linux, or a simulated copy elsewhere (your clipboard is restored immediately after).
3. A frameless, resizable, always-on-top popup opens next to your cursor and stays until you close it.
4. Your question + selection go **straight from your machine to your AI provider**, streamed back into the popup. There is no middleman server.

The runner dino is original pixel art drawn for this project — a homage to everyone's favorite offline companion, not a copy of it.

## Privacy

- API keys never leave your device (local config file, `0600`).
- The only network calls are the ones you trigger, directly to the provider you configured.
- The clipboard is used momentarily during capture and restored right away.
- No analytics, no telemetry, no accounts.

## License

[MIT](LICENSE)
