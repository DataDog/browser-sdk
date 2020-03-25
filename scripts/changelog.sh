#!/usr/bin/env bash

OLD_VERSION=$(git describe --tags $(git rev-list --tags --max-count=1))
NEW_VERSION=$(jq -r .version lerna.json)
CHANGES=$(git log $OLD_VERSION..HEAD --pretty=format:"- %s")

NEW=$(awk -v new="\n## $NEW_VERSION\n\n${CHANGES//$'\n'/\\n}" 'NR==2{print new}1' CHANGELOG.md)
echo -e "$NEW" > CHANGELOG.md

$EDITOR CHANGELOG.md
