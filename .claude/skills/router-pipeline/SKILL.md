---
name: router-pipeline
description: Fully automated pipeline that generates a draft Browser SDK router integration PR from an npm package URL. Usage: /router-pipeline <npm-package-url>
---

# Router Integration Pipeline

You are an orchestrator that spawns a fresh `claude -p` process for each stage to generate a complete Browser SDK router integration package and draft PR.

Each stage runs in a completely fresh context window via `claude -p`. Stages communicate through YAML artifacts on disk.

## Input

The single argument is an npm package URL (e.g. `https://www.npmjs.com/package/@angular/router`).

Example: `/router-pipeline https://www.npmjs.com/package/vue-router`

## Step 1: Resolve Package Metadata & Initialize

This step runs in the orchestrator (you), not a subprocess.

1. **Fetch npm package page** — Use WebFetch on the provided URL to extract:
   - Package name (e.g. `vue-router`, `@angular/router`)
   - Framework name — derive a lowercase identifier from the package name (e.g. `vue-router` → `vue`, `@angular/router` → `angular`, `@tanstack/react-router` → `tanstack-react-router`, `svelte` → `svelte`)
   - Homepage / repository URL
   - Keywords and description

2. **Find router documentation URLs** — From the npm page metadata (homepage, repository links), locate the framework's official routing documentation:
   - Check the homepage URL for docs links
   - Check the GitHub repository README for documentation links
   - Look for `/docs/`, `/guide/`, `/routing` paths on the framework's site
   - Collect 1-3 relevant documentation URLs focused on routing

3. **Create artifact directory and input file:**

```bash
mkdir -p docs/integrations/<framework>
```

Write `docs/integrations/<framework>/00-pipeline-input.md`:

```markdown
# Pipeline Input

**Framework:** <framework>
**npm package:** <npm-url>
**Documentation URLs:**

- <url1>
- <url2>

**Initiated:** <ISO timestamp>
```

## Step 2: Stage 1 — Fetch Docs

Run in a fresh context window:

```bash
claude -p "Read .claude/skills/router-fetch-docs/SKILL.md for your instructions. Framework: <framework>. Artifact directory: docs/integrations/<framework>/." --allowedTools Read,Write,Bash,Glob,Grep,WebFetch,WebSearch
```

After completion, check if `docs/integrations/<framework>/EXIT.md` exists.

If EXIT.md exists, read it and report the exit to the user. Stop.

Otherwise, verify `docs/integrations/<framework>/01-router-concepts.yaml` was created.

## Step 3: Stage 2 — Design Decisions

Run in a fresh context window:

```bash
claude -p "Read .claude/skills/router-design/SKILL.md for your instructions. Framework: <framework>. Artifact directory: docs/integrations/<framework>/." --model opus --allowedTools Read,Write,Bash,Glob,Grep
```

After completion, check if `docs/integrations/<framework>/EXIT.md` exists.

If EXIT.md exists, read it and report the exit to the user. Stop.

Otherwise, verify `docs/integrations/<framework>/02-design-decisions.yaml` was created.

## Step 4: Stage 3 — Generate Code

Run in a fresh context window:

```bash
claude -p "Read .claude/skills/router-generate/SKILL.md for your instructions. Framework: <framework>. Artifact directory: docs/integrations/<framework>/." --model opus --allowedTools Read,Write,Edit,Bash,Glob,Grep
```

After completion, verify `docs/integrations/<framework>/03-generation-manifest.md` was created.

## Step 5: Stage 4 — Create PR

Run in a fresh context window:

```bash
claude -p "Read .claude/skills/router-pr/SKILL.md for your instructions. Framework: <framework>. Artifact directory: docs/integrations/<framework>/." --allowedTools Read,Bash
```

Report the PR URL to the user when done.

## Error Handling

If any `claude -p` process fails (non-zero exit code), check the artifacts written so far. Write `EXIT.md` with:

- Stage: which stage failed
- Reason: error details
- Artifacts produced: list of files written before failure

All artifacts written before the failure are preserved. Stop and report the failure to the user.
