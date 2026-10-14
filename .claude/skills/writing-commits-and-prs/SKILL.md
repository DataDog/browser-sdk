---
name: writing-commits-and-prs
description: Use when writing a commit message or PR title in browser-sdk, choosing a gitmoji, or opening a pull request. Use when the "Lint PR title" check fails or a PR is blocked on unsigned commits.
---

# Commits and PRs in browser-sdk

## Overview

PRs are squash-merged, so **the PR title becomes the commit on `main` and the changelog line**. At release, the changelog generator files each line under Public or Internal Changes by its first emoji. Picking the gitmoji is a release-notes decision.

## Format

```
<gitmoji> [JIRA-123] Short description
```

- Gitmoji first. The "Lint PR title" CI check (`scripts/check-pr-title.ts`) rejects anything else, except release PRs titled `vX.Y.Z`.
- Ticket optional, after the emoji: `✨ [RUM-16985] Report WASM debug info type`
- Commits inside a PR follow the same convention (`👌` for review follow-ups).

## Picking the Gitmoji

Pick from the list in `docs/DEVELOPMENT.md`. Its "User-facing changes" are the ones that land under Public Changes. CI only checks that the title starts with one of them (`scripts/lib/gitmoji.ts`), not that you picked the right one.

## Signing

Every commit must be signed. `main` has a `required_signatures` ruleset, so a single unsigned commit blocks the merge. Check every commit on the branch with `git log --format='%h %G? %s' origin/main..HEAD`, only `N` means unsigned. If `git config commit.gpgsign` isn't `true`, commit with `git commit -S`.

## Opening the PR

- Branch `<username>/<feature>` from `main`, target `main`.
- Fill every section of `.github/PULL_REQUEST_TEMPLATE.md`: Motivation, Changes, Test instructions, Checklist. The `manual-testing` skill produces Test instructions.
- Don't touch `CHANGELOG.md`, it's generated at release.

## Common Mistakes

| Mistake                                      | Fix                                                        |
| -------------------------------------------- | ---------------------------------------------------------- |
| `🔥` for removing a deprecated public API    | `💥`, otherwise the break hides under Internal Changes     |
| Ticket before the emoji (`[RUM-123] ✨ ...`) | Emoji first, CI rejects the title otherwise                |
| Adding a `CHANGELOG.md` entry                | Remove it, the release process generates it from PR titles |
