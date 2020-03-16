#!/bin/sh

echo 'Checking local branch is up to date with remote...'
git remote update

LOCAL=$(git rev-parse '@')
REMOTE=$(git rev-parse '@{u}')

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "up to date"
    exit 0
else
    echo "out of sync!"
    exit 1
fi
