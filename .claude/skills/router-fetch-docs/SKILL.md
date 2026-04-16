---
name: router-fetch-docs
description: 'Stage 1: Fetch framework router documentation and extract structured routing concepts into a YAML schema. Reads input from docs/integrations/<framework>/00-pipeline-input.md.'
---

# Stage 1: Fetch Router Documentation

## Context

You are Stage 1 of the router integration pipeline. Your job is to fetch framework router documentation and extract structured routing concepts as **factual data** for later stages.

Do NOT analyze which hooks the SDK should use, recommend approaches, or compare with existing SDK integrations. Only document what the framework provides.

## Input

Read `docs/integrations/<framework>/00-pipeline-input.md` to get the framework name and documentation URLs. Find the `<framework>` directory by listing `docs/integrations/` and finding the most recently created subdirectory.

## Process

### 1. Fetch Documentation

Before fetching the provided URLs directly, try to find LLM-friendly versions of the docs:

1. **Check for `llms.txt`** — Fetch `<site-root>/llms.txt` (e.g. `https://svelte.dev/llms.txt`). This file indexes markdown documentation pages designed for LLM consumption. If it exists, use it to navigate to the relevant routing pages.
2. **Try `.md` suffix** — For each doc URL, try appending `.md` to the path (e.g. `https://svelte.dev/docs/kit/routing.md`). Many doc sites serve a raw markdown version this way, which is much easier to parse accurately.
3. **Fall back to HTML** — If neither LLM-friendly format is available, fetch the original URLs.

Use the WebFetch tool for all fetches. If a URL fails, note it and continue with remaining URLs. If all URLs fail, write EXIT.md and stop.

**Prefer over-fetching to under-fetching.** Fetch every routing-related page you can find — API references, guides, tutorials. It is better to fetch a page and not need it than to miss information that a later stage requires. When in doubt, fetch it.

### 2. Extract Router Concepts into YAML Schema

Analyze the fetched documentation and fill in the following YAML schema. Every field must be populated from the documentation. Use `null` for features the framework does not support.

#### Sourcing Rules

**Core rule: if the docs have a page or anchor for it, add the source URL.** API names, hook names, type names — everything factual must be traceable to documentation.

- Claims that cannot be traced to documentation must include a comment: `# _inferred: <reasoning>`
- When a field value comes from a specific doc page, add the source URL as a YAML comment on the same line

#### YAML Schema

Read `output.schema.yaml` (next to this SKILL.md) for the schema and field descriptions. See `docs/integrations/_example/01-router-concepts.yaml` for a filled-in example.

Produce a YAML file conforming to this schema. Fill in every field. Use `null` for features the framework does not support.

### 3. Compatibility Assessment

A framework is **incompatible** if it lacks:
- A client-side route tree or route matching mechanism
- Dynamic segment parameters
- Navigation lifecycle events that can be hooked into

If incompatible: do NOT write the YAML file. Instead write `docs/integrations/<framework>/EXIT.md` with the reason and stop.

A framework is **compatible** even if:
- It uses file-based routing (as long as there's a runtime route representation)
- Some hooks fire later than ideal (trade-off is documented, not a blocker)

## Output

Write the result to `docs/integrations/<framework>/01-router-concepts.yaml`.
