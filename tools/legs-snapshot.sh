#!/usr/bin/env bash
# The legs test page (legs/) runs on its own copy of the scene's code, so that it can be put up
# while the main page is still the version before. This refreshes that copy from src/ and vendor/.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rm -rf "$root/legs/src" "$root/legs/vendor"
cp -R "$root/src" "$root/legs/src"
cp -R "$root/vendor" "$root/legs/vendor"
echo "legs/src and legs/vendor refreshed from src/ and vendor/"
