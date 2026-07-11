#!/bin/sh
# Rex installer for macOS and Linux — https://github.com/MoustafaTech/rex
# Usage:  curl -fsSL https://raw.githubusercontent.com/MoustafaTech/rex/main/install.sh | sh
# Downloads the latest release, installs it, and starts Rex detached from the
# terminal — you can close this window and Rex keeps running in the tray.
set -e

REPO="MoustafaTech/rex"
API="https://api.github.com/repos/$REPO/releases/latest"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required."

asset_url() {
  curl -fsSL "$API" | grep -oE '"browser_download_url": *"[^"]+"' \
    | grep -oE 'https://[^"]+' | grep "$1" | head -1
}

OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
  case "$(uname -m)" in
    arm64) PAT='mac-arm64\.dmg$' ;;
    *)     PAT='mac-x64\.dmg$' ;;
  esac
  URL=$(asset_url "$PAT") || true
  [ -n "$URL" ] || fail "could not find a macOS download in the latest release."

  say "Downloading $(basename "$URL")…"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --progress-bar "$URL" -o "$TMP/Rex.dmg"

  say "Installing Rex.app…"
  MOUNT=$(hdiutil attach -nobrowse -readonly "$TMP/Rex.dmg" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
  [ -d "$MOUNT/Rex.app" ] || fail "unexpected DMG layout."
  DEST="/Applications"
  if [ ! -w "$DEST" ]; then DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
  rm -rf "$DEST/Rex.app"
  ditto "$MOUNT/Rex.app" "$DEST/Rex.app"
  hdiutil detach "$MOUNT" -quiet || true
  # Clear the quarantine flag so Gatekeeper doesn't block the unsigned app.
  xattr -dr com.apple.quarantine "$DEST/Rex.app" 2>/dev/null || true

  say "Starting Rex…"
  open -a "$DEST/Rex.app"

  say "Rex is installed in $DEST and running in your menu bar (pixel dino icon)."
  say "One-time setup: enable Rex under System Settings → Privacy & Security → Accessibility,"
  say "allow the 'System Events' prompt, then quit Rex from the menu bar and open it once more."
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" 2>/dev/null || true

elif [ "$OS" = "Linux" ]; then
  [ "$(uname -m)" = "x86_64" ] || fail "prebuilt Rex is x86_64-only; build from source on this machine."
  URL=$(asset_url 'linux-x86_64\.AppImage$') || true
  [ -n "$URL" ] || fail "could not find a Linux download in the latest release."

  BIN="$HOME/.local/bin"
  mkdir -p "$BIN"
  say "Downloading $(basename "$URL")…"
  curl -fL --progress-bar "$URL" -o "$BIN/rex"
  chmod +x "$BIN/rex"

  # Menu entry so Rex also shows up in the app launcher.
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/rex.desktop" <<DESKTOP
[Desktop Entry]
Name=Rex
Comment=Select text, tap Ctrl, ask AI
Exec=$BIN/rex
Terminal=false
Type=Application
Categories=Utility;
DESKTOP

  say "Starting Rex…"
  # setsid detaches it from this terminal completely.
  (setsid "$BIN/rex" >/dev/null 2>&1 &)

  say "Rex is installed at $BIN/rex and running in your system tray."
  say "For the smoothest capture install the clipboard helpers:"
  say "  X11:     sudo apt install xclip xdotool"
  say "  Wayland: sudo apt install wl-clipboard"
  case ":$PATH:" in
    *":$BIN:"*) ;;
    *) say "Note: add $BIN to your PATH to launch Rex by name later." ;;
  esac

else
  fail "unsupported OS: $OS (on Windows, use install.ps1 — see the README)."
fi
