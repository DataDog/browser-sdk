---
name: router:pipeline
description: Fully automated pipeline that generates a draft Browser SDK router integration PR from framework public docs. Usage: /router:pipeline <framework> <doc-url> [<doc-url>...]
---

# Router Integration Pipeline

You are an orchestrator that chains five stage skills to generate a complete Browser SDK router integration package and draft PR.

## Input

Parse the arguments: first argument is the framework name (lowercase), remaining arguments are documentation URLs.

Example: `/router:pipeline svelte https://svelte.dev/docs/kit/routing`

## Step 1: Initialize

Create the artifact directory and write the input file:

```bash
mkdir -p docs/integrations/<framework>
```

Write `docs/integrations/<framework>/00-pipeline-input.md`:

```markdown
# Pipeline Input

**Framework:** <framework>
**Documentation URLs:**
- <url1>
- <url2>
**Initiated:** <ISO timestamp>
```

## Step 2: Invoke /router:fetch-docs

Use the Skill tool to invoke `router:fetch-docs`.

After completion, read `docs/integrations/<framework>/01-router-concepts.md` and check the `compatible` field.

If `compatible: false`, write `docs/integrations/<framework>/EXIT.md` with:
- Stage: fetch-docs
- Reason: the incompatibility reason from 01-router-concepts.md
- Artifacts produced: 00-pipeline-input.md, 01-router-concepts.md

Then stop and report the exit to the user.

## Step 3: Invoke /router:analyze

Use the Skill tool to invoke `router:analyze`.

After completion, read `docs/integrations/<framework>/02-sdk-mapping.md` and check for any concept marked `unmapped` with severity `critical`.

If critical unmapped concepts exist, write `EXIT.md` with:
- Stage: analyze
- Reason: which critical concepts could not be mapped and why
- Artifacts produced: 00-pipeline-input.md, 01-router-concepts.md, 02-sdk-mapping.md

Then stop and report the exit to the user.

## Step 4: Invoke /router:design

Use the Skill tool to invoke `router:design`.

## Step 5: Invoke /router:generate

Use the Skill tool to invoke `router:generate`.

## Step 6: Invoke /router:pr

Use the Skill tool to invoke `router:pr`.

## Error Handling

If any stage fails (fetch timeout, parse error, tool failure), write `EXIT.md` with:
- Stage: which stage failed
- Reason: error details
- Artifacts produced: list of files written before failure

All artifacts written before the failure are preserved. Stop and report the failure to the user.
