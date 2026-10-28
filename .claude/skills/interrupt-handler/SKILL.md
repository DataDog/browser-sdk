---
name: interrupt-handler
description: Use when triaging or fixing the open dependency PRs (label `dependencies`) in browser-sdk, i.e. Renovate updates and the scheduled Chrome bump. Use when a dependency PR fails CI, needs a CI image rebuild (Node, Playwright or Chrome change), or its `*-pinned` e2e jobs break after a Playwright bump.
---

# Interrupt Handler: Dependency PRs

Goal: every open `dependencies` PR is green and ready for review, or has a clear reason it is blocked. Don't merge them; they still need a review.

The PRs come from two bots:

| Author             | Branch                           | Changes                                                                                                                                                              |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renovate[bot]`    | `renovate/*`                     | npm deps and the `Dockerfile` Node image. Non-major updates are grouped in `renovate/all-minor-patch`; `@playwright/test` has its own `renovate/playwright-monorepo` |
| `dd-octo-sts[bot]` | `bump-chrome-version-to-<major>` | `CHROME_PACKAGE_VERSION` **and** `CURRENT_CI_IMAGE` in `.gitlab-ci.yml` (scheduled `scripts/test/bump-chrome-version.ts`)                                            |

## Tools

- **`gh`** for PRs, diffs and commits.
- **DDCI MCP** (`ddci-mcp-prod`), repository `DataDog/browser-sdk`: `getCIStatus` (by `pull_request_number`) lists failed tasks, `getJobErrorSummary` then `getJobLogs` explain them, `retryJob` reruns one. A manual job (`ci-image`) only appears as a task once someone has played it.
- **Datadog MCP** `search_datadog_ci_pipeline_events`, query `@git.repository.id_v2:"github.com/datadog/browser-sdk" @git.branch:<branch>`: GitLab pipeline IDs (`ci_level: pipeline`) and past `ci-image` runs (`ci_level: job`, `@ci.job.name:ci-image`, finished jobs only).
- **Nothing can play the manual `ci-image` GitLab job.** The user clicks it (step 3c).

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
- `CONFLICTING` → update it from main first (step 3e), whatever its CI says.

## 2. Classify and plan

Classify from the diff, never the title: "Update all non-major dependencies" regularly carries a Node bump.

```bash
gh pr diff <n> | grep -E '^diff --git a/Dockerfile |^\+\s+(CHROME_PACKAGE_VERSION|CURRENT_CI_IMAGE):|^\+\s+"@playwright/test": "[0-9]'
```

- Any match on `Dockerfile`, `CHROME_PACKAGE_VERSION` or `@playwright/test` → **Rebuild** (step 3). A `+ CURRENT_CI_IMAGE:` line means the PR already bumps the image (Chrome PRs always do).
- No match → **Code** (step 4).

CI jobs run in `registry.ddbuild.io/ci/browser-sdk:$CURRENT_CI_IMAGE`, built by the manual `ci-image` job from the `Dockerfile`: Node base image, Chrome `.deb` pinned by `CHROME_PACKAGE_VERSION`, browsers for the root `@playwright/test` version. A stale image shows up as:

| Symptom                                                                                          | Cause                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Nearly every job fails within a minute with `runner_system_failure`                              | `CURRENT_CI_IMAGE` bumped, image never built   |
| `check-node-version`: `Different node versions detected!`                                        | Node bumped in `Dockerfile`, image not rebuilt |
| `e2e: [chromium\|firefox\|webkit]`: `Executable doesn't exist at /root/.cache/ms-playwright/...` | Playwright bumped, image has old browsers      |

`check-node-version` prints three versions. If `docker` and `process` match but `volta` doesn't, the image is fine: Renovate moved `volta.node` in `package.json` while its 7-day `minimumReleaseAge` held back the newer `node` Docker tag. Set `volta.node` to the Dockerfile's version. That is not an image input, so no rebuild is needed.

**Several rebuild PRs: stack them** (step 3a). They can't each use main + 1, and the PR that merges second needs an image that also contains the first one's changes. In a stack, each layer's image is built on top of the layers below, so every image builds now and stays valid as the layers below merge.

Show the user a table (PR, CI status, category, planned action) and get their go-ahead before pushing anything or retrying jobs.

## 3. Rebuild PR

### a. Stack and bump `CURRENT_CI_IMAGE`

The image only depends on the `Dockerfile`, `CHROME_PACKAGE_VERSION` and the root `@playwright/test` version. A PR's `CURRENT_CI_IMAGE` must be main + its position in the stack: 1 for the bottom layer, or for a lone rebuild PR.

```bash
git fetch origin main <branch>...
git show origin/main:.gitlab-ci.yml | grep -m1 'CURRENT_CI_IMAGE:'
git show origin/<branch>:.gitlab-ci.yml | grep -m1 'CURRENT_CI_IMAGE:'
```

**One rebuild PR:** first make sure the branch has main's image inputs. If main changed one since the branch point, for example because another rebuild merged, update the branch from main first (step 3e). Otherwise the new image would miss main's Node, Chrome or Playwright change:

```bash
git diff --quiet origin/<branch>...origin/main -- Dockerfile .gitlab-ci.yml || echo "main changed Dockerfile or .gitlab-ci.yml"
git show origin/main:package.json | jq -r '.devDependencies["@playwright/test"]'   # compare with the merge base's
```

Then:

- Value is main + 1 → bumped, go to b.
- Value equals main → in a worktree (step 5), set main + 1, commit `👷 Bump CI image to <value>`, push.

**Several:** order them bottom to top: a PR already at main + 1 (Chrome), then PRs with fix commits, then the oldest. Build the stack bottom-up in one worktree. The rebases rewrite the bots' signed commits, so check signing first (step 5). Each local branch must start at its remote tip, using `git branch -f <branch> origin/<branch>` if it isn't checked out elsewhere.

```bash
git worktree add "$TMPDIR/ih-stack" <bottom>
# bottom: bring it to main + 1 as for a single PR
git -C "$TMPDIR/ih-stack" checkout <next>
git -C "$TMPDIR/ih-stack" rebase --onto <bottom> origin/main   # replays only <next>'s own commits
# bump <next> to main + 2, commit; repeat for each layer above
(cd "$TMPDIR/ih-stack" && gh stack init <bottom> <next>... && gh stack submit --auto)
```

`package.json`/`yarn.lock` conflicts during the rebase only come from neighbouring version bumps. Run `git checkout --ours package.json yarn.lock` (the layer below), re-apply this PR's own version changes, run `yarn install`, `git add`, `git rebase --continue`. Check that the lockfile diff only touches this PR's packages.

`gh stack submit` force-pushes (with lease) and points each PR at the layer below. Renovate stops updating the branches it no longer owns, which is expected. `gh stack` is a GitHub CLI extension; install it once with `gh extension install github/gh-stack`. Always pass explicit branch names and `--auto`, because bare `gh stack` commands open interactive prompts. `gh stack <command> --help` documents each command.

### b. Already built?

Find the latest `ci-image` run on the branch and the commit it ran on. That is either a `ci-image` task in `getCIStatus` (the commit is the request's `head_commit`), or a `@ci.job.name:ci-image` job on the branch (`ci_level: job`, `@git.commit.sha`). A run only counts if that commit has the same image inputs as the branch head. Run time isn't enough: an input can change after the bump, and an older pipeline's job can be played later. Run `git fetch origin <sha>` if the commit was rewritten since.

```bash
image_inputs() {
  git show "$1:Dockerfile"
  git show "$1:.gitlab-ci.yml" | grep -E '^  (CURRENT_CI_IMAGE|CHROME_PACKAGE_VERSION):'
  git show "$1:package.json" | jq -r '.devDependencies["@playwright/test"]'
}
[ "$(image_inputs <run sha>)" = "$(image_inputs origin/<branch>)" ] && echo "same image inputs"
```

Matching `SUCCESS` → the image exists, go to d. Matching `PENDING`/running → someone already played it, wait (step c). No matching run → step c.

### c. Ask the user to play `ci-image`

For each layer, give the user the branch's pipeline list (they can play them all at once), `https://gitlab.ddbuild.io/DataDog/browser-sdk/-/pipelines?ref=<url-encoded branch>` (CI Visibility only knows a pipeline once its jobs finish, so don't wait for its ID): "open the newest pipeline (commit `<short sha>`) and play ▶ `ci-image` (first stage), it takes about 5 minutes". Once played, it appears as a `ci-image` task in `getCIStatus`; check it every few minutes until it leaves `PENDING`.

If `ci-image` fails, read its logs (`getJobErrorSummary`, `getJobLogs`). Ask for a second attempt only after pushing a fix; otherwise report the failure and stop on this PR.

### d. Rerun CI on the new image

If you have a fix commit to push anyway, push it: the new pipeline uses the new image. Otherwise `getCIStatus` the PR and `retryJob` every `FAILED` task (latest execution). Whatever still fails is a code failure: step 4, and step 3f for a Playwright bump.

### e. After a merge

Layers merge bottom first. Once one merges, run `gh stack sync` in the stack worktree. GitHub retargets the next PR to main, and `sync` rebases the rest onto it. The images stay valid with no rebuild: every remaining layer is still main + its position, with the same image inputs. Rebuild a layer (play `ci-image` again, same tag) only if a layer below changed an image input after that layer's image was built.

A fix for a lower layer goes on that layer, followed by `gh stack rebase --upstack` and `gh stack push`. Code fixes don't touch the image.

**main moved past a PR's value** because a rebuild outside the stack merged: update the bottom layer, then re-bump every layer.

- **Renovate PR without fix commits, not stacked**: you can tick the rebase checkbox. Renovate recreates the branch from main and drops manual commits, including the bump, so classify it again afterwards. **Never tick it on a PR that has fix commits**: they would be lost.
  ```bash
  gh pr view <n> --json body --jq .body \
    | sed 's/- \[ \] <!-- rebase-check -->/- [x] <!-- rebase-check -->/' \
    | gh pr edit <n> --body-file -
  ```
- **Otherwise**: in a worktree, merge `origin/main`. On a `.gitlab-ci.yml` conflict, take main's file and re-apply the PR's own changes (Chrome: `CHROME_PACKAGE_VERSION`). Re-bump, commit, push, then continue at b.

### f. Playwright bumps: pinned e2e

The `e2e: [*-pinned]` jobs don't use the image's browsers. They drive a pinned Playwright **1.40.1** `run-server` through `test/e2e/scripts/pinnedProxy.ts`, a JSON-RPC translation proxy between the current client and the old server. Some Playwright bumps change the protocol and break it; many don't.

Stale proxy: after the rebuild, regular e2e are green but the **same** tests fail on all three pinned browsers. That's systematic, not flaky; don't retry. To fix it:

1. List the failing tests (`getJobLogs` on one pinned job, the list sits just before the `N passed` summary). The test area hints at the protocol area (error tests → `pageError`, console tests → console events).
2. Diff Playwright's protocol between the previous and new client versions: `packages/protocol/src/protocol.yml` up to v1.59.1, `packages/protocol/src/channels.d.ts` from v1.60.0 (`https://raw.githubusercontent.com/microsoft/playwright/v<version>/packages/protocol/src/channels.d.ts`). Look for **new required fields** on events or initializers that the 1.40 server never sends; the release notes name the new API.
3. Patch `pinnedProxy.ts` like the existing patches: server→client fields in `rewriteServerToClient`, client→server params in `rewriteClientToServer`. A zero or empty stub that passes the client's validator is enough. Update the client version in the header comments of `pinnedProxy.ts` and `playwright.config.ts`.
4. Verify locally with `yarn test:e2e --project=chromium-pinned -g "<failing test>"` (one-time `yarn test:e2e:setup:pinned`, see the `running-tests` skill), then push.

Reference: PR #4719 (Playwright 1.60 added a required `location` to `pageError`).

## 4. Code failures

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
# ...edit, test, commit (see the `writing-commits-and-prs` skill: 👷 gitmoji, signed commits)
git -C "$TMPDIR/ih-<n>" push origin HEAD:refs/heads/<branch>
git worktree remove --force "$TMPDIR/ih-<n>"
```

The push has no `--force`: if a bot pushed meanwhile it is rejected, so fetch again and redo the change on top.

**Signing.** `main` requires signed commits. Commits, merges and rebases, including the stack rebases that rewrite the bots' commits, all need local signing. Check that `git config commit.gpgsign` is `true` before starting; otherwise pass `-S`. Before pushing, check every commit you created or rewrote. `git log %G?` prints `N` for signed commits when `gpg.ssh.allowedSignersFile` isn't configured, so look for the signature itself:

```bash
for c in $(git -C "$TMPDIR/ih-<n>" rev-list origin/main..HEAD); do
  git -C "$TMPDIR/ih-<n>" cat-file -p "$c" | grep -qE 'BEGIN (SSH|PGP) SIGNATURE' || echo "unsigned: $c"
done
```

Code PRs are independent. If your agent supports subagents, give each one a single Code PR and this recipe, and have it commit without pushing and report the diff and its reasoning. Show the user each fix and push after approval. Keep rebuild PRs and the stack in the main thread, since they need the user.

## 6. Babysit

Re-run the survey until every PR is green or blocked; in Claude Code, `/loop 10m` with that request. End with a table:

- **Ready for review**: green, with links.
- **Blocked**: why, and what unblocks it (for example "migration needed" or "image build failed").
- **Needs a human**: skipped (someone else's commits) or needs a migration.
