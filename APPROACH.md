# CI Eval Loop Approach

This document describes the autonomous CI eval loop used to iteratively develop GitLab CI jobs without human review between iterations.

## Strategy

An implementation agent executes changes in a tight loop:

0. Create a branch and push it to remote (one-time setup)
1. Modify `.gitlab-ci.yml` (and any related config)
2. Commit and push
3. Trigger a GitLab pipeline via the MCP server
4. Wait for the job to complete
5. Fetch and interpret the logs
6. Apply fixes and go back to step 1

## Tooling

### GitLab MCP server

The loop relies on the [`gitlab-mcp-server`](https://github.com/DataDog/gitlab-mcp-server) MCP:

- **`create_pipeline`** — triggers a pipeline for a given project + branch directly via the GitLab API.
- **`get_pipeline_jobs`** — lists jobs in a pipeline to get job IDs.
- **`wait_for_job`** — polls until a job completes (or a log pattern is matched).
- **`get_job_logs`** — fetches the raw log output; use `tail_lines` to get just the relevant end of the log.

The following tools must be in the `allowedTools` list in `.claude/settings.local.json` to avoid approval prompts during the loop:

```json
"mcp__gitlab-mcp-server__create_pipeline",
"mcp__gitlab-mcp-server__get_pipeline_jobs",
"mcp__gitlab-mcp-server__wait_for_job",
"mcp__gitlab-mcp-server__get_job_logs"
```

### Typical call sequence

```
# One-time setup
git checkout -b <branch> && git push -u origin <branch>

# Loop
create_pipeline(project_id="<org>/<repo>", ref="<branch>")
  → pipeline.id

get_pipeline_jobs(project_id, pipeline.id)
  → job.id for the target job

wait_for_job(project_id, job.id)

get_job_logs(project_id, job.id, tail_lines=50)
  → interpret output, apply fixes, commit, push, loop
```

## Gotchas

- **`get_pipeline_jobs` does not return manual jobs** (`when: manual`). If you need to trigger
  a manual job (e.g. `ci-image`), you must get its ID from the GitLab UI or from the user, then
  call `play_job` with it.

## Alternative approach

An alternative is to use the `fetch-ci-results` skill from the [Datadog Claude marketplace](https://github.com/datadog/claude-marketplace), which wraps `gh pr checks` + `get_ddci_logs.sh`. Drawbacks compared to the MCP approach:

- Requires an open GitHub PR, which adds an unnecessary layer
- Shell commands trigger user approval prompts in Claude Code
- No "wait for job" capability
