---
name: router-pipeline
description: Fully automated pipeline that generates a draft Browser SDK router integration PR from an npm package URL. Usage: /router-pipeline <npm-package-url>
---

# Router Integration Pipeline

You are an orchestrator that dispatches `claude -p` processes for each stage to generate a complete Browser SDK router integration package and draft PR.

Each stage runs as a dedicated `claude -p` process with its own context window. Stages 1 and 2 use `--output-format json --json-schema <schema>`. The full CLI wrapper JSON (including `structured_output`, `is_error`, `duration_ms`, cost, etc.) is persisted as the reviewable artifact under `docs/integrations/<framework>/`. Downstream stages extract `.structured_output` with `jq` when they read the data. Stages 3 and 4 produce code and markdown via normal tool calls.

## Input

The single argument is an npm package URL (e.g. `https://www.npmjs.com/package/@angular/router`).

Example: `/router-pipeline https://www.npmjs.com/package/vue-router`

## Step 1: Stage 1 — Fetch Docs (structured JSON)

The skill instructs the model to emit a JSON object conforming to `.claude/skills/router-fetch-docs/output.schema.json`. The harness validates it and exposes it on `.structured_output`.

The framework name isn't known yet, so write the artifact to a real temp file first, then move it under `docs/integrations/<framework>/` once stage 1 resolves it.

```bash
SCHEMA_1=$(cat .claude/skills/router-fetch-docs/output.schema.json)

STAGE1_OUT=/tmp/router-stage1.json

claude -p "/router-fetch-docs <npm-url>" \
  --model opus \
  --output-format json \
  --json-schema "$SCHEMA_1" \
  --permission-mode auto \
  > "$STAGE1_OUT"

FRAMEWORK=$(jq -r '.structured_output.metadata.framework.value' "$STAGE1_OUT")
mkdir -p "docs/integrations/$FRAMEWORK"
mv "$STAGE1_OUT" "docs/integrations/$FRAMEWORK/01-router-concepts.json"
```

The file committed under `docs/integrations/$FRAMEWORK/01-router-concepts.json` is the full CLI wrapper: `{type, subtype, is_error, duration_ms, result, structured_output, usage, total_cost_usd, ...}`. Downstream stages use `jq '.structured_output' <file>` to read the schema-shaped payload.

## Step 2: Stage 2 — Design Decisions (structured JSON)

```bash
SCHEMA_2=$(cat .claude/skills/router-design/output.schema.json)

claude -p "/router-design $FRAMEWORK" \
  --model opus \
  --output-format json \
  --json-schema "$SCHEMA_2" \
  --permission-mode auto \
  > "docs/integrations/$FRAMEWORK/02-design-decisions.json"
```

## Step 3: Stage 3 — Generate Code

Stage 3 produces source code and a markdown manifest via normal tool calls — no structured output.

```bash
claude -p "/router-generate $FRAMEWORK" \
  --model opus \
  --permission-mode auto
```

Verify `docs/integrations/$FRAMEWORK/03-generation-manifest.md`

Check the **Validation** section in the manifest. If `**Status:** fail`, stop the pipeline and report the failures to the user. Do not proceed to Stage 4.

## Step 4: Stage 4 — Create PR

```bash
claude -p "/router-pr $FRAMEWORK" \
  --model opus \
  --permission-mode auto
```

Report the PR URL to the user when done.
