#!/usr/bin/env bash
set -euo pipefail

# Builds all @datadog/browser-* packages and copies their tarballs into
# test/apps/nextjs/vendor/ so the test app can be deployed standalone.
#
# Run from anywhere — the script resolves paths relative to itself.
#
# Usage: bash test/apps/nextjs/scripts/build-vendor.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../../.." && pwd)"
VENDOR_DIR="$APP_DIR/vendor"

echo "Building SDK packages..."
cd "$REPO_ROOT"
yarn build

echo ""
echo "Packing tarballs into $VENDOR_DIR..."
mkdir -p "$VENDOR_DIR"

declare -A PACKAGES=(
  [browser-core]=core
  [browser-rum-core]=rum-core
  [browser-rum]=rum
  [browser-rum-slim]=rum-slim
  [browser-rum-nextjs]=rum-nextjs
  [browser-rum-react]=rum-react
  [browser-worker]=worker
)

for tarball_name in "${!PACKAGES[@]}"; do
  pkg_dir="${PACKAGES[$tarball_name]}"
  echo "  Packing $pkg_dir -> vendor/$tarball_name.tgz"
  cd "$REPO_ROOT/packages/$pkg_dir"
  yarn pack -o "$VENDOR_DIR/$tarball_name.tgz"
done

echo ""
echo "Done. Vendor tarballs:"
ls -lh "$VENDOR_DIR"/*.tgz
echo ""
echo "Next steps:"
echo "  cd test/apps/nextjs"
echo "  yarn install"
echo "  yarn build"
