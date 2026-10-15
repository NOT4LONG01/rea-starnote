#!/usr/bin/env bash
# OPTIONAL. Needed only to run the real StarNote Android app (its APK is ARM-only; your PC is x86).
# This fetches a THIRD-PARTY tool (casualsnek/waydroid_script) as your normal user, into ~/waydroid_script,
# and does NOT run anything as root. Read the tool's code, then run the printed sudo command yourself.
set -euo pipefail

DIR="$HOME/waydroid_script"
[ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only || git clone https://github.com/casualsnek/waydroid_script "$DIR"
cd "$DIR"
/usr/bin/python3 -m venv venv
./venv/bin/pip install -q -r requirements.txt

cat <<EOF

Fetched into $DIR (commit $(git rev-parse --short HEAD)). Skim main.py and stuff/*.py if you want to audit it.

Your CPU is AMD, so the right ARM translation layer is "libndk". To install it (needs root, Waydroid must be installed):

    sudo $DIR/venv/bin/python3 $DIR/main.py install libndk

Then restart Waydroid:  waydroid session stop ; sudo systemctl restart waydroid-container
EOF
