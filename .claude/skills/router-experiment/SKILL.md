---
name: router-experiment
description: Run the router pipeline N times in parallel worktrees for the same framework to measure output consistency. Usage: /router-experiment <npm-package-url> [runs=3]
---

# Router Pipeline Consistency Experiment

You run the router pipeline multiple times in parallel (each in its own git worktree) for the same npm package, then diff the outputs to measure consistency. Each run creates its own draft PR with a unique branch suffix.

## Input

- **Arg 1** (required): npm package URL (e.g. `https://www.npmjs.com/package/vue-router`)
- **Arg 2** (optional): number of parallel runs (default: 3)

## Step 1: Setup

```bash
RUNS=<N>  # default 3
EXPERIMENT_DIR="/tmp/router-experiment-$(date +%s)"
mkdir -p "$EXPERIMENT_DIR"
```

Create worktrees from main:

```bash
for i in $(seq 1 $RUNS); do
  git worktree add "$EXPERIMENT_DIR/run-$i" main
done
```

## Step 2: Launch Parallel Runs

Each run invokes `/router-pipeline` (stages 1–4) in its own worktree. Branch collisions are handled inside `/router-pr`, which appends a random suffix to the branch name.

```bash
NPM_URL="<npm-url>"

for i in $(seq 1 $RUNS); do
  (
    cd "$EXPERIMENT_DIR/run-$i"
    claude -p "/router-pipeline $NPM_URL" \
      --model opus \
      --allowedTools "Skill,Read,Write,Edit,Glob,Grep,Bash,WebFetch,WebSearch,Agent"
  ) > "$EXPERIMENT_DIR/run-$i.log" 2>&1 &
done

wait
```

Run via Bash with a generous timeout (up to 10 minutes). Use `run_in_background: true` so you can monitor progress.

## Step 3: Compare Outputs

### 3a. Discover framework name

```bash
FRAMEWORK=$(basename $(dirname $(ls "$EXPERIMENT_DIR"/run-1/docs/integrations/*/01-router-concepts.json)))
```

### 3b. Diff artifacts

The stage 1/2 artifacts are full `claude -p` wrappers — they include `duration_ms`, `session_id`, `total_cost_usd`, etc. that vary run-to-run. Diff the `structured_output` only, normalized with `jq -S`:

```bash
for artifact in 01-router-concepts.json 02-design-decisions.json; do
  echo "=== $artifact (structured_output) ==="
  for i in $(seq 2 $RUNS); do
    echo "--- run-1 vs run-$i ---"
    diff -u \
      <(jq -S '.structured_output' "$EXPERIMENT_DIR/run-1/docs/integrations/$FRAMEWORK/$artifact") \
      <(jq -S '.structured_output' "$EXPERIMENT_DIR/run-$i/docs/integrations/$FRAMEWORK/$artifact") || true
  done
done

# Cost / duration / turns side-by-side
echo "=== cost & duration ==="
for i in $(seq 1 $RUNS); do
  for artifact in 01-router-concepts.json 02-design-decisions.json; do
    jq -r --arg run "run-$i" --arg art "$artifact" \
      '[$run, $art, .duration_ms, .num_turns, .total_cost_usd] | @tsv' \
      "$EXPERIMENT_DIR/run-$i/docs/integrations/$FRAMEWORK/$artifact"
  done
done | column -t

echo "=== 03-generation-manifest.md ==="
for i in $(seq 2 $RUNS); do
  echo "--- run-1 vs run-$i ---"
  diff -u "$EXPERIMENT_DIR/run-1/docs/integrations/$FRAMEWORK/03-generation-manifest.md" \
          "$EXPERIMENT_DIR/run-$i/docs/integrations/$FRAMEWORK/03-generation-manifest.md" || true
done
```

### 3c. Diff generated source code

```bash
echo "=== Source code ==="
for i in $(seq 2 $RUNS); do
  echo "--- run-1 vs run-$i ---"
  diff -rq "$EXPERIMENT_DIR/run-1/packages/" "$EXPERIMENT_DIR/run-$i/packages/" || true
done
```

For files that differ, show the actual diff:

```bash
for i in $(seq 2 $RUNS); do
  diff -ru "$EXPERIMENT_DIR/run-1/packages/" "$EXPERIMENT_DIR/run-$i/packages/" || true
done
```

## Step 4: Report

Present a summary table:

```
## Experiment Results: <framework> (N=<RUNS>)

| Artifact                  | Identical? | Diff lines |
|---------------------------|------------|------------|
| 01-router-concepts.json   | ✅ / ❌    | <count>    |
| 02-design-decisions.json  | ✅ / ❌    | <count>    |
| 03-generation-manifest.md | ✅ / ❌    | <count>    |
| Generated source code     | ✅ / ❌    | <count>    |

### Observations
<Summarize what varied and what stayed consistent. Note any semantic vs cosmetic differences.>
```

If any diffs exist, show the most interesting ones inline (truncated if large).

## Step 5: Cleanup

Remove the worktrees:

```bash
for i in $(seq 1 $RUNS); do
  git worktree remove "$EXPERIMENT_DIR/run-$i" --force
done
rm -rf "$EXPERIMENT_DIR"
```
