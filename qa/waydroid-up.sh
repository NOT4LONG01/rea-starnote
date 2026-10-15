#!/usr/bin/env bash
# Starts Android (Waydroid) for QA and connects adb. Runs as the normal user, no sudo.
#   bash qa/waydroid-up.sh          start everything
#   bash qa/waydroid-up.sh down     stop the session and the compositor this script started
set -uo pipefail

RUN="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
SOCK="waydroid-qa"
PIDFILE="/tmp/waydroid-qa-weston.pid"

if [ "${1:-}" = "down" ]; then
  waydroid session stop 2>/dev/null
  [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null && rm -f "$PIDFILE"
  adb disconnect 2>/dev/null
  echo "stopped"; exit 0
fi

command -v waydroid >/dev/null || { echo "waydroid is not installed (run: sudo bash qa/waydroid-setup.sh)"; exit 1; }

# 1. A small Wayland compositor shown as a window on the X11 desktop (so you can watch Android).
if [ ! -S "$RUN/$SOCK" ]; then
  weston --backend=x11 --socket="$SOCK" --width=1280 --height=800 --idle-time=0 >/tmp/waydroid-qa-weston.log 2>&1 &
  echo $! > "$PIDFILE"
  for _ in $(seq 1 30); do [ -S "$RUN/$SOCK" ] && break; sleep 0.5; done
fi
[ -S "$RUN/$SOCK" ] || { echo "weston did not start; see /tmp/waydroid-qa-weston.log"; exit 1; }

# 2. Android session on that compositor.
WAYLAND_DISPLAY="$SOCK" waydroid session start >/tmp/waydroid-qa-session.log 2>&1 &
for _ in $(seq 1 90); do
  waydroid status 2>/dev/null | grep -q "Session:.*RUNNING" && break
  sleep 1
done
waydroid status

# 3. adb over the container network, and let Android's "localhost:1420" reach this PC's dev server.
# status prints "IP address:<TAB>UNKNOWN" until Android's network is up, so poll for a real IPv4.
IP=""
for _ in $(seq 1 90); do
  IP="$(waydroid status | sed -n 's/^IP address:[[:space:]]*//p' | grep -E '^[0-9]+(\.[0-9]+){3}$' || true)"
  [ -n "$IP" ] && break
  sleep 1
done
[ -n "$IP" ] || { echo "no container IP yet; wait a few seconds and re-run"; exit 1; }
adb start-server >/dev/null 2>&1
adb connect "$IP:5555"
for _ in $(seq 1 60); do
  [ "$(adb -s "$IP:5555" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 1
done
adb -s "$IP:5555" reverse tcp:1420 tcp:1420 && echo "adb reverse ok: Android localhost:1420 -> this PC's :1420"
echo "ANDROID_SERIAL=$IP:5555"
echo "ABIs: $(adb -s "$IP:5555" shell getprop ro.product.cpu.abilist | tr -d '\r')"
