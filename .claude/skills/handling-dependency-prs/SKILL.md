---
name: handling-dependency-prs
description: Use when triaging or fixing the open dependency PRs (label `dependencies`) in browser-sdk, i.e. Renovate updates and the scheduled Chrome bump. Use when a dependency PR fails CI, changes the CI image (Node, Playwright or Chrome change), or its `*-pinned` e2e jobs break after a Playwright bump.
---

# Handling Dependency PRs

Goal: every open `dependencies` PR is green and ready for review, or has a clear reason it is blocked. Don't merge them; they still need a review.

The PRs come from two bots:

| Author             | Branch                           | Changes                                                                                                                                                                                                           |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renovate[bot]`    | `renovate/*`                     | npm deps and the `Dockerfile` Node image. Non-major updates are grouped in `renovate/all-minor-patch`, except Node.js, `@playwright/test`, GitHub Actions and Yarn, which are grouped in `renovate/manual-review` |
| `dd-octo-sts[bot]` | `bump-chrome-version-to-<major>` | `CHROME_PACKAGE_VERSION` in `.gitlab-ci.yml` (scheduled `scripts/test/bump-chrome-version.ts`)                                                                                                                    |

## Tools

- **`gh`** for PRs, diffs and commits.
- **DDCI MCP** (`ddci-mcp-prod`), repository `DataDog/browser-sdk`: `getCIStatus` (by `pull_request_number`) lists failed tasks, `getJobErrorSummary` then `getJobLogs` explain them, `retryJob` reruns one. The default `detail_level` only lists pending and failed tasks, so use `detail_level: "full"` to see successful ones such as a finished `ci-image`.
- **Datadog MCP** `search_datadog_ci_pipeline_events`, query `@git.repository.id_v2:"github.com/datadog/browser-sdk" @git.branch:<branch>`: GitLab pipeline IDs (`ci_level: pipeline`) and past `ci-image` runs (`ci_level: job`, `@ci.job.name:ci-image`, finished jobs only).

If an MCP server is disconnected or needs authentication, ask the user to connect it instead of working around it.

## 1. Survey

```bash
gh pr list --label dependencies --state open \
  --json number,title,author,headRefName,mergeable,statusCheckRollup \
  --jq '.[] | {number, title, author: .author.login, branch: .headRefName, mergeable,
    checks: (.statusCheckRollup | length),
    failing: [.statusCheckRollup[] | select((.conclusion // .state) | IN("FAILURE","ERROR","TIMED_OUT","CANCELLED","ACTION_REQUIRED","STARTUP_FAILURE")) | (.context // .name)],
    pending: [.statusCheckRollup[] | select((.conclusion // .state) | IN("","PENDING","EXPECTED")) | (.context // .name)]}'
```

GitHub checks are `CheckRun` (`conclusion`) and GitLab jobs are `StatusContext` (`state`, named `dd-gitlab/<job>`), so read both fields.

For each PR, check who pushed to it:

```bash
gh pr view <n> --json commits --jq '[.commits[].authors[].login | select(. != "")] | unique'
gh api user --jq .login
```

**Skip** a PR with commits from anyone other than `renovate[bot]`, `dd-octo-sts[bot]` or the current user: someone else owns it. Your own commits from an earlier run are expected.

A PR is **green** only when it has checks (`checks` > 0), none failing or pending, and `mergeable` is `MERGEABLE`:

- No checks yet, only pending, or `mergeable: UNKNOWN` (GitHub is still computing it) → check it again later.
- `CONFLICTING` → update it from main first (step 4a), whatever its CI says.

## 2. Classify and plan

Classify from the diff, never the title: "Update all non-major dependencies" regularly carries a Node bump.

```bash
gh pr diff <n> | grep -E '^diff --git a/Dockerfile |^\+\s+CHROME_PACKAGE_VERSION:|^\+\s+"@playwright/test": "[0-9]'
```

- Any match → **Image** (step 3).
- No match → **Code** (step 4).

CI jobs run in `registry.ddbuild.io/ci/browser-sdk:<tag>`, built from the `Dockerfile`: Node base image, Chrome `.deb` pinned by `CHROME_PACKAGE_VERSION`, browsers for the root `@playwright/test` version. The tag is a hash of these inputs and of `.gitlab/ci-image.yml`. The `ci-image` job (first stage of every pipeline) computes it, builds and signs the image when no image has this tag yet, and gives `CI_IMAGE` to the other jobs. Nothing needs to be bumped or played by hand, and several image PRs don't need to be stacked: each pipeline builds the image of its own commit.

`check-node-version` prints three versions. If `docker` and `process` match but `volta` doesn't, the image is fine: Renovate moved `volta.node` in `package.json` while its 7-day `minimumReleaseAge` held back the newer `node` Docker tag. Set `volta.node` to the Dockerfile's version. That is not an image input, so the image doesn't change.

Show the user a table (PR, CI status, category, planned action) and get their go-ahead before pushing anything or retrying jobs.

## 3. Image PR

### a. The `ci-image` job

A new image takes about 5 minutes to build; the other jobs start after it. If `ci-image` fails, the other jobs don't run. Read its logs (`getJobErrorSummary`, `getJobLogs`): `retryJob` once for an infra error, otherwise fix the `Dockerfile` input on the branch (for example a Chrome `.deb` that is not published yet) or report the failure and stop on this PR.

Once `ci-image` passes, whatever still fails is a code failure: step 4, and step 3b for a Playwright bump.

### b. Playwright bumps: pinned e2e

The `e2e: [*-pinned]` jobs don't use the image's browsers. They drive a pinned Playwright **1.40.1** `run-server` through `test/e2e/scripts/pinnedProxy.ts`, a JSON-RPC translation proxy between the current client and the old server. Some Playwright bumps change the protocol and break it; many don't.

Stale proxy: regular e2e are green but the **same** tests fail on all three pinned browsers. That's systematic, not flaky; don't retry. To fix it:

1. List the failing tests (`getJobLogs` on one pinned job, the list sits just before the `N passed` summary). The test area hints at the protocol area (error tests → `pageError`, console tests → console events).
2. Diff Playwright's protocol between the previous and new client versions: `packages/protocol/src/protocol.yml` up to v1.59.1, `packages/protocol/src/channels.d.ts` from v1.60.0 (`https://raw.githubusercontent.com/microsoft/playwright/v<version>/packages/protocol/src/channels.d.ts`). Look for **new required fields** on events or initializers that the 1.40 server never sends; the release notes name the new API.
3. Patch `pinnedProxy.ts` like the existing patches: server→client fields in `rewriteServerToClient`, client→server params in `rewriteClientToServer`. A zero or empty stub that passes the client's validator is enough. Update the client version in the header comments of `pinnedProxy.ts` and `playwright.config.ts`.
4. Verify locally with `yarn test:e2e --project=chromium-pinned -g "<failing test>"` (one-time `yarn test:e2e:setup:pinned`, see the `running-tests` skill), then push.

Reference: PR #4719 (Playwright 1.60 added a required `location` to `pageError`).

## 4. Code failures

### a. Update from main

- **Renovate PR without fix commits**: you can tick the rebase checkbox. Renovate recreates the branch from main and drops manual commits, so classify it again afterwards. **Never tick it on a PR that has fix commits**: they would be lost.
  ```bash
  gh pr view <n> --json body --jq .body \
    | sed 's/- \[ \] <!-- rebase-check -->/- [x] <!-- rebase-check -->/' \
    | gh pr edit <n> --body-file -
  ```
- **Otherwise**: in a worktree (step 5), merge `origin/main`. On a `.gitlab-ci.yml` conflict, take main's file and re-apply the PR's own changes (Chrome: `CHROME_PACKAGE_VERSION`). Commit, push.

### b. Failed jobs

`getCIStatus` the PR, then for each `FAILED` task (ignore `shadow` and `allow_failure`) read `getJobErrorSummary`, and `getJobLogs` when the summary isn't enough.

| Symptom                                                            | Action                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Infra error on one job (`runner_system_failure`, network, timeout) | `retryJob` once                                                             |
| One e2e test on one browser, unrelated to the updated packages     | Probably flaky: `retryJob` once, treat as real if it fails again            |
| `typecheck`, `build-and-lint`                                      | Dependency API or types changed: update the code                            |
| `unit`, e2e on all browsers                                        | Behavior changed: read the changelog, fix the code or the test expectations |
| Install or lockfile errors                                         | `yarn install` on the branch and commit the lockfile                        |
| Major upgrade needing a real migration                             | Report it with a proposed plan instead of forcing a fix                     |

Reproduce locally before pushing (see the `running-tests` skill).

## 5. Working on PR branches

Never check out a PR in the main working copy (`gh pr checkout`): parallel work collides. Use one detached worktree per PR:

```bash
git fetch origin <branch>
git worktree add --detach "$TMPDIR/ih-<n>" FETCH_HEAD
(cd "$TMPDIR/ih-<n>" && yarn install)
# ...edit, test, commit (see the `writing-commits-and-prs` skill: `chore(deps)` / `chore(ci)` type, signed commits)
git -C "$TMPDIR/ih-<n>" push origin HEAD:refs/heads/<branch> \
  && git worktree remove --force "$TMPDIR/ih-<n>"
```

The push has no `--force`: if a bot pushed meanwhile it is rejected, so fetch again and redo the change on top. A commit on the detached `HEAD` only exists in its worktree, so remove the worktree only after a successful push. Never remove one holding unpushed commits, including a subagent's.

**Signing.** `main` requires signed commits. Commits, merges and rebases, including merges of main into the bots' branches, all need local signing. Check that `git config commit.gpgsign` is `true` before starting; otherwise pass `-S`. Before pushing, check every commit you created or rewrote. `git log %G?` prints `N` for signed commits when `gpg.ssh.allowedSignersFile` isn't configured, so look for the signature itself:

```bash
for c in $(git -C "$TMPDIR/ih-<n>" rev-list origin/main..HEAD); do
  git -C "$TMPDIR/ih-<n>" cat-file -p "$c" | grep -qE 'BEGIN (SSH|PGP) SIGNATURE' || echo "unsigned: $c"
done
```

Code PRs are independent. If your agent supports subagents, give each one a single Code PR and this recipe, and have it commit without pushing, leave its worktree in place, and report the worktree path, the diff and its reasoning. Show the user each fix, then push from that worktree after approval and remove it. Keep image PRs in the main thread.

## 6. Babysit

Re-run the survey until every PR is green or blocked; in Claude Code, `/loop 10m` with that request. End with a table:

- **Ready for review**: green, with links.
- **Blocked**: why, and what unblocks it (for example "migration needed" or "image build failed").
- **Needs a human**: skipped (someone else's commits) or needs a migration.
