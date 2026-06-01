#!/usr/bin/env bash
# -----------------------------------------------------------
# Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019-Present Datadog, Inc.
# -----------------------------------------------------------
#
# Entry point for the `Code Review` CI job.
# Clones rum-ai-toolkit, mints a short-lived GitHub token via dd-octo-sts,
# then hands off to the toolkit's `review.sh` which runs the `cr-agent`.

set -ueo pipefail
set -x

# TODO: switch toolkit ref to `main` before merging to develop.
TOOLKIT_REF="ncreated/feat/cr-agent"
TOOLKIT_DIR="$CI_PROJECT_DIR/.rum-ai-toolkit"

echo "▸ Cloning rum-ai-toolkit ($TOOLKIT_REF)..."
git clone -vv --depth 1 --branch "$TOOLKIT_REF" \
    "git@github.com:DataDog/rum-ai-toolkit.git" "$TOOLKIT_DIR"

echo "▸ Installing cr-agent venv..."
make -C "$TOOLKIT_DIR/tools/cr-agent" install

# echo "▸ Minting GitHub token via dd-octo-sts (policy: self.cr-agent)..."
# GITHUB_TOKEN=$(dd-octo-sts --disable-tracing token --scope DataDog/browser-sdk --policy self.cr-agent)
# export GITHUB_TOKEN
# trap 'dd-octo-sts --disable-tracing revoke' EXIT
#
# echo "▸ Handing off to review.sh..."
# exec "$TOOLKIT_DIR/tools/cr-agent/review.sh"
