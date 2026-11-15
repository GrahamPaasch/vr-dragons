#!/usr/bin/env bash
# Copy the static site (index.html, src/, vendor/) into a folder that a web server publishes.
#
#   tools/deploy-copy.sh ~/personal-webpage/public/vr/dragons
#
# Nothing is built. The target must be empty, missing, or an earlier copy of this page; anything
# else is refused so a wrong path cannot be overwritten by accident. src/ and vendor/ in the
# target are replaced whole, so a file that was deleted here does not linger there.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: tools/deploy-copy.sh <target-folder>" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="$1"
marker='Two Dragons, <em>October</em>'

if [ -d "$target" ] && [ -n "$(ls -A "$target")" ]; then
  if ! grep -qsF "$marker" "$target/index.html"; then
    echo "Refusing: $target is not empty and is not an earlier copy of this page." >&2
    exit 1
  fi
fi

mkdir -p "$target"
cp "$root/index.html" "$target/index.html"
rm -rf "$target/src" "$target/vendor"
cp -R "$root/src" "$target/src"
cp -R "$root/vendor" "$target/vendor"

echo "Copied index.html, src/ and vendor/ to $target"
echo "If this is the grahampaasch.com repo, 'vr/dragons' must be in STATIC_APP_DIRS in next.config.mjs."
