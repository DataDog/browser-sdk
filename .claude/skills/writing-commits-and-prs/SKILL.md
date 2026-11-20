---
name: writing-commits-and-prs
description: Use when writing a commit message or PR title in browser-sdk, choosing a Conventional Commits type or scope, or opening a pull request. Use when the "Lint PR title" check fails or a PR is blocked on unsigned commits.
---

# Commits and PRs in browser-sdk

## Overview

PRs are squash-merged, so **the PR title becomes the commit on `main` and the changelog line**. release-please reads these commits: the type picks the changelog section and the version bump (`feat` → minor, `!` → major, anything else → patch). Picking the type is a release-notes decision.

## Format

```
type(scope[,scope])[!]: Description
```

- Conventional Commits with a **mandatory scope**. The "Lint PR title" CI check (`scripts/check-pr-title.ts`) rejects anything else.
- Examples: `feat(rum): Add view name API`, `fix(rum,logs): Drop empty context`, `ci(e2e): Quarantine flaky test`, `chore(deps): Update vite to v8.4`.
- No Jira key in the title (CI rejects `[RUM-123]`): it would end up in the public changelog. Put `Refs: RUM-123` in the PR description and the key in the branch name.
- Commits inside a PR are squashed away; use the same convention for consistency.

## Picking the type and scope

Types and scopes are listed in `docs/DEVELOPMENT.md` and defined in `scripts/lib/conventionalCommits.ts`.

- **Public types** (`feat`, `fix`, `perf`, `docs`, `exp`) land in the public changelog and need **package scopes** (`rum`, `logs`, `core`, `react`, …).
- **Internal types** (`build`, `chore`, `ci`, `refactor`, `test`, `style`) land under "Internal Changes" and accept any scope. Internal scopes (`ci`, `deps`, `e2e`, `scripts`, `release`, `repo`, …) only go with internal types.
- Scope = the package the change is about, from a customer's point of view. Several packages: `fix(rum,logs): …`.
- CI checks that the combination is allowed, not that you picked the right type.

## Signing

Every commit must be signed. `main` has a `required_signatures` ruleset, so a single unsigned commit blocks the merge. Check every commit on the branch with `git log --format='%h %G? %s' origin/main..HEAD`, only `N` means unsigned. If `git config commit.gpgsign` isn't `true`, commit with `git commit -S`.

## Opening the PR

- Branch `<username>/<JIRA-KEY>-<feature>` from `main` (or `<username>/<feature>` without a ticket), target `main`.
- Fill every section of `.github/PULL_REQUEST_TEMPLATE.md`: Motivation (with the `Refs:` line), Changes, Test instructions, Checklist. The `manual-testing` skill produces Test instructions.
- Don't touch `CHANGELOG.md`, it's generated at release.

## Common Mistakes

| Mistake                                        | Fix                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `refactor(rum): Remove deprecated API`         | `feat(rum)!: Remove deprecated API`, otherwise the break is hidden      |
| `fix(e2e): Fix flaky test`                     | `test(e2e): …`: `fix` is public and needs a package scope               |
| `feat(rum): [RUM-123] Add view name API`       | Drop the key from the title, add `Refs: RUM-123` to the description     |
| `feat: Add view name API` (no scope)           | Add the package scope: `feat(rum): …`                                   |
| Keeping GitHub's `Revert "feat(rum): …"` title | Retitle `revert(rum): …`                                                |
| `feat(js-core)!: …` for a js-core-only break   | `feat(js-core): …` and describe the break: `!` would bump the SDK major |
| Adding a `CHANGELOG.md` entry                  | Remove it, the release process generates it from PR titles              |
