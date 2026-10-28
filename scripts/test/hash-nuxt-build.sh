#!/usr/bin/env bash
# EXPERIMENT (do not merge): fingerprint the Nuxt test app build output.
# Usage: hash-nuxt-build.sh <dest-dir>
# Writes <dest-dir>/files.txt (per-file sha), <dest-dir>/hash.txt (aggregate) and a copy of the
# client bundle, then prints the aggregate hash so it shows in the job log.
set -euo pipefail

dest="$1"
output="test/apps/nuxt-app/.output"
mkdir -p "$dest"

# nitro.json embeds the build date, so it is excluded from the fingerprint
(cd "$output" && find . -type f ! -name nitro.json | LC_ALL=C sort | xargs sha256sum) > "$dest/files.txt"
sha256sum < "$dest/files.txt" | cut -c1-16 > "$dest/hash.txt"
cp -R "$output/public/_nuxt" "$dest/client"

echo "NUXT_BUILD_HASH=$(cat "$dest/hash.txt") files=$(wc -l < "$dest/files.txt")"
