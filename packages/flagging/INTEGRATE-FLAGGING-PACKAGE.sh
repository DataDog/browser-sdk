#!/bin/bash

# Check if correct number of arguments provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 /path/to/flagging/package /path/to/target/project"
    exit 1
fi

# Store arguments in variables
FLAGGING_PATH="$1"
TARGET_PROJECT="$2"

# Validate paths
if [ ! -d "$FLAGGING_PATH" ]; then
    echo "Error: Flagging package directory does not exist: $FLAGGING_PATH"
    exit 1
fi

if [ ! -d "$TARGET_PROJECT" ]; then
    echo "Error: Target project directory does not exist: $TARGET_PROJECT"
    exit 1
fi

# Navigate to flagging package directory
pushd "$FLAGGING_PATH" || exit 1

# Generate UUID and update package.json version
echo "Updating package version with prerelease tag and UUID..."
UUID=$(uuidgen)
PACKAGE_JSON_PATH="packages/flagging/package.json"
if [ ! -f "$PACKAGE_JSON_PATH" ]; then
    echo "Error: package.json not found at $PACKAGE_JSON_PATH"
    popd
    exit 1
fi

# Read version from package.json
CURRENT_VERSION=$(node -e "try { console.log(require('$(pwd)/$PACKAGE_JSON_PATH').version) } catch(e) { console.error('Error reading package.json:', e.message); process.exit(1); }")
NEW_VERSION="${CURRENT_VERSION}-prerelease.${UUID}"
echo "Current version: ${CURRENT_VERSION}"
echo "Generated UUID: ${UUID}"
echo "New version: ${NEW_VERSION}"

# Update package.json
node -e "const pkg = require('$(pwd)/$PACKAGE_JSON_PATH'); pkg.version = '${NEW_VERSION}'; require('fs').writeFileSync('$(pwd)/$PACKAGE_JSON_PATH', JSON.stringify(pkg, null, 2) + '\n');"

# Build and pack the package with specific output name
echo "Building and packing the flagging package..."
yarn build || { echo "Build failed"; popd; exit 1; }

# Get package version from package.json
PACKAGE_VERSION=$(node -e "console.log(require('$(pwd)/$PACKAGE_JSON_PATH').version)")
TGZ_FILE="datadog-browser-flagging-v${PACKAGE_VERSION}.tgz"

yarn pack --out "$TGZ_FILE" || { echo "Pack failed"; popd; exit 1; }

# Move the .tgz file to the target project
echo "Moving $TGZ_FILE to target project..."
cp "$TGZ_FILE" "$TARGET_PROJECT/" || { echo "Failed to copy package file"; popd; exit 1; }

# Restore package.json to original state
echo "Restoring package.json to original state..."
git checkout -- "$PACKAGE_JSON_PATH" || { echo "Failed to restore package.json"; popd; exit 1; }

# Return to original directory
popd

# Output installation instructions
echo
echo "Package successfully built and copied to target project."
echo
echo "If you are using yarn, run the following commands to complete the installation:"
echo
echo "  cd $(realpath "$TARGET_PROJECT")"
echo "  yarn add ./$TGZ_FILE"
echo
echo "Don't forget to commit the $TGZ_FILE to your project's source control." 
