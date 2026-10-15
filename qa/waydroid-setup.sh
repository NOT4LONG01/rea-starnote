#!/usr/bin/env bash
# One-time Waydroid install for Linux Mint 22.x (Ubuntu 24.04 "noble" base).
# Run once, as root:   sudo bash qa/waydroid-setup.sh
# Read it first. It only: installs packages, adds the official Waydroid apt repo, loads the Android "binder"
# kernel module, and downloads the vanilla (no Google Play) Android image. It does not touch your files.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Run with sudo:  sudo bash $0"; exit 1; }
CODENAME=noble   # Mint 22.x is built on Ubuntu 24.04; Mint's own codename is not in Waydroid's repo

echo "==> 1/6 packages (weston = tiny Wayland compositor so Waydroid can run on your X11 desktop, adb = control Android)"
apt-get update
apt-get install -y curl ca-certificates gnupg lxc weston adb

echo "==> 2/6 official Waydroid apt repository (https://repo.waydro.id)"
install -d -m 0755 /usr/share/keyrings
curl -fsSL https://repo.waydro.id/waydroid.gpg -o /usr/share/keyrings/waydroid.gpg
echo "deb [signed-by=/usr/share/keyrings/waydroid.gpg] https://repo.waydro.id/ ${CODENAME} main" > /etc/apt/sources.list.d/waydroid.list
apt-get update
apt-get install -y waydroid

echo "==> 3/6 Android binder kernel module (needed by Android; shipped with your kernel, just not loaded)"
modprobe binder_linux devices="binder,hwbinder,vndbinder" || echo "   (modprobe failed; Waydroid will try binderfs instead)"
echo "binder_linux" > /etc/modules-load.d/waydroid.conf
echo "options binder_linux devices=binder,hwbinder,vndbinder" > /etc/modprobe.d/waydroid.conf

echo "==> 4/6 download the Android image (about 1 GB, vanilla LineageOS, no Google services)"
waydroid init

echo "==> 5/6 start the container service (also at boot)"
systemctl enable --now waydroid-container

echo "==> 6/6 check"
waydroid status || true
echo
echo "Done. Next: tell Claude 'waydroid is set up'. (Optional, for the real StarNote APK: bash qa/waydroid-arm-fetch.sh)"
