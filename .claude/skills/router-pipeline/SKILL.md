---
name: router-pipeline
description: Fully automated pipeline that generates a draft Browser SDK router integration PR from an npm package URL. Usage: /router-pipeline <npm-package-url>
---

# Router Integration Pipeline

You are an orchestrator that chains four stage skills to generate a complete Browser SDK router integration package and draft PR.

## Input

The single argument is an npm package URL (e.g. `https://www.npmjs.com/package/@angular/router`).

Example: `/router-pipeline https://www.npmjs.com/package/vue-router`

## Step 1: Resolve Package Metadata & Initialize

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

## Step 2: Invoke /router-fetch-docs

Use the Skill tool to invoke `router-fetch-docs`.

After completion, check if `docs/integrations/<framework>/EXIT.md` exists (Stage 1 writes it if the framework is incompatible).

If EXIT.md exists, read it and report the exit to the user. Stop.

Otherwise, verify `docs/integrations/<framework>/01-router-concepts.yaml` was created.

## Step 3: Invoke /router-design

Use the Skill tool to invoke `router-design`.

After completion, check if `docs/integrations/<framework>/EXIT.md` exists (Stage 2 writes it if critical issues are found).

If EXIT.md exists, read it and report the exit to the user. Stop.

Otherwise, verify `docs/integrations/<framework>/02-design-decisions.yaml` was created.

## Step 4: Invoke /router-generate

Use the Skill tool to invoke `router-generate`.

## Step 5: Invoke /router-pr

Use the Skill tool to invoke `router-pr`.

## Error Handling

If any stage fails (fetch timeout, parse error, tool failure), write `EXIT.md` with:

- Stage: which stage failed
- Reason: error details
- Artifacts produced: list of files written before failure

All artifacts written before the failure are preserved. Stop and report the failure to the user.
