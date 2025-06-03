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
cd "$FLAGGING_PATH" || exit 1

# Build and pack the package with specific output name
echo "Building and packing the flagging package..."
yarn build || { echo "Build failed"; exit 1; }

# Get package version from package.json
PACKAGE_VERSION=$(node -p "require('./package.json').version")
TGZ_FILE="datadog-browser-flagging-v${PACKAGE_VERSION}.tgz"

yarn pack --out "$TGZ_FILE" || { echo "Pack failed"; exit 1; }

# Move the .tgz file to the target project
echo "Moving $TGZ_FILE to target project..."
cp "$TGZ_FILE" "$TARGET_PROJECT/" || { echo "Failed to copy package file"; exit 1; }

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