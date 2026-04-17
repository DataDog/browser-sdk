---
name: router-fetch-docs
description: 'Stage 1: Fetch framework router documentation and extract structured routing concepts as JSON conforming to output.schema.json from an npm package URL.'
---

# Stage 1: Fetch Router Documentation

## Context

You are Stage 1 of the router integration pipeline. Your job is to resolve package metadata, fetch framework router documentation, and extract structured routing concepts as **factual data** for later stages.

The pipeline invokes you with `claude -p --output-format json --json-schema .claude/skills/router-fetch-docs/output.schema.json`. Your final message must be a single JSON object conforming to that schema; the harness validates it and exposes it on `.structured_output` of the CLI wrapper written to `docs/integrations/<framework>/01-router-concepts.json`.

Do NOT analyze which hooks the SDK should use, recommend approaches, or compare with existing SDK integrations. Only document what the framework provides.

## Input

You receive an **npm package URL** as skill param (e.g. `https://www.npmjs.com/package/vue-router`).

## Process

### 1. Resolve Package Metadata

Use WebFetch on the provided npm URL to extract:

- **Package name** (e.g. `vue-router`, `@angular/router`)
- **Framework identifier** — derive a lowercase identifier from the package name (e.g. `vue-router` → `vue`, `@angular/router` → `angular`, `@tanstack/react-router` → `tanstack-react-router`)
- Homepage / repository URL
- Keywords and description

Then **find router documentation URLs** — from the npm page metadata (homepage, repository links), locate the framework's official routing documentation:

- Check the homepage URL for docs links
- Check the GitHub repository README for documentation links
- Look for `/docs/`, `/guide/`, `/routing` paths on the framework's site
- Collect 1-3 relevant documentation URLs focused on routing

The pipeline creates the artifact directory for you — do not run `mkdir` yourself.

### 2. Fetch Documentation

Before fetching the provided URLs directly, try to find LLM-friendly versions of the docs:

1. **Check for `llms.txt`** — Fetch `<site-root>/llms.txt` (e.g. `https://svelte.dev/llms.txt`). This file indexes markdown documentation pages designed for LLM consumption. If it exists, use it to navigate to the relevant routing pages.
2. **Try `.md` suffix** — For each doc URL, try appending `.md` to the path (e.g. `https://svelte.dev/docs/kit/routing.md`). Many doc sites serve a raw markdown version this way, which is much easier to parse accurately.
3. **Fall back to HTML** — If neither LLM-friendly format is available, fetch the original URLs.

Use the WebFetch tool for all fetches. If a URL fails, note it and continue with remaining URLs. If all URLs fail, stop without emitting a JSON object — the harness will mark the run as an error.

**Prefer over-fetching to under-fetching.** Fetch every routing-related page you can find — API references, guides, tutorials. It is better to fetch a page and not need it than to miss information that a later stage requires. When in doubt, fetch it.

### 3. Extract Router Concepts into the JSON Schema

Analyze the fetched documentation and populate every field in the JSON schema. Use `null` for features the framework does not support.

#### Sourcing Rules

Every leaf field has a sibling `source` field. This is **mandatory** — the schema validation fails without it.

- If extracted from documentation: set `source` to the URL (with anchor if possible)
- If inferred from multiple sources or reasoning: set `source` to `"inferred: <one-line reasoning>"`
- API names, hook names, type names — everything factual must be traceable to a specific doc page

#### JSON Schema

Read `output.schema.json` (next to this SKILL.md) for the schema and field descriptions.

### 4. Compatibility Assessment

A framework is **incompatible** if it lacks:

- A client-side route tree or route matching mechanism
- Dynamic segment parameters
- Navigation lifecycle events that can be hooked into

If incompatible: stop without emitting a JSON object. The harness will mark the run as an error.

A framework is **compatible** even if:

- It uses file-based routing (as long as there's a runtime route representation)
- Some hooks fire later than ideal (trade-off is documented, not a blocker)

## Output

Return the populated object as your final message. The pipeline invokes you with `--output-format json --json-schema output.schema.json`; the harness validates the object and writes the full CLI wrapper (with the object on `.structured_output`) to `docs/integrations/<framework>/01-router-concepts.json`. Do not write files yourself.
