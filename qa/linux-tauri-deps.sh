#!/usr/bin/env bash
# System libraries needed to build the Tauri (desktop) app on Linux Mint 22 / Ubuntu 24.04.
# Run once as root:   sudo bash qa/linux-tauri-deps.sh
# It only installs distro packages (nothing else). Rust itself is installed per-user afterwards, no sudo.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo:  sudo bash $0"; exit 1; }
apt-get update
apt-get install -y build-essential curl wget file patchelf \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libssl-dev libxdo-dev \
  libayatana-appindicator3-dev librsvg2-dev
echo "done: tell Claude 'tauri deps installed'"
