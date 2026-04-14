---
name: router-fetch-docs
description: 'Stage 1: Fetch framework router documentation and extract structured routing concepts. Reads input from docs/integrations/<framework>/00-pipeline-input.md.'
---

# Stage 1: Fetch Router Documentation

## Context

You are Stage 1 of the router integration pipeline. Your job is to fetch framework router documentation and extract structured routing concepts as factual reference material for later stages.

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

### 2. Extract Router Concepts

Analyze the fetched documentation and produce a structured summary covering these sections.

#### Sourcing Rules

- Every API name (class, interface, function, event, type) MUST be a clickable link to its API reference page (e.g. `[GuardsCheckEnd](https://angular.dev/api/router/GuardsCheckEnd)`).
- Do NOT use generic `([source](url))` links. Instead, make the API name itself the link.
- Every factual claim MUST be linked — either via an API link on the relevant name, or via a `([guide](url))` / `([commit](url))` link for non-API content.
- Unsourced claims must be marked as _inferred: \<reasoning\>_.

#### Required Sections

**Route Definition Format**
How routes are declared: config object, file-based routing, decorators, or other. Include code examples from the docs.

**Dynamic Segment Syntax**
What syntax the framework uses for parameterized route segments (e.g. `:id`, `[id]`, `{id}`). Include examples.

**Catch-All / Wildcard Syntax**
What syntax the framework uses for catch-all or wildcard routes (e.g. `*`, `**`, `[...slug]`, `/:pathMatch(.*)*`). Include examples. If the framework has no catch-all syntax, state that explicitly.

**Navigation Lifecycle Hooks**
List every navigation lifecycle event/hook the framework exposes, in the order they fire. For each, describe:

- When it fires relative to other hooks
- What data is available at that point
- Whether it can cancel/redirect navigation

**Navigation Lifecycle Timing**
Document the order of operations during a navigation. For each phase, state:

- Where in the lifecycle do **redirects** resolve?
- Where do **data fetches** (loaders, resolvers) execute?
- Where does **component rendering** begin?
- Which hooks fire between each phase?

Include a timeline or ordered list showing the sequence: redirect resolution → guard evaluation → data fetching → component rendering, mapped to the specific hooks/events from the previous section.

**Route Matching Model**
How the framework matches URLs to routes: nested vs flat, layout routes, named outlets/slots, parallel routes.

**Programmatic Navigation API**
How the router exposes current route state and navigation methods. What objects/hooks are available to read the current route, its params, and matched route records.

### 3. Major Version History (Last 2 Years)

Fetch the framework router's release/changelog information to identify major versions released within the last 2 years (since April 2024).

**How to find versions:**

Use GitHub Releases to identify major versions. Fetch `https://github.com/<org>/<repo>/releases` and filter to major versions (semver X.0.0) released after April 2024. For each major version found, fetch its individual release page to get the full release notes and breaking changes.

**For each major version, document:**

- **Version number and release date**
- **Breaking changes** — list every breaking change from the release notes. Quote or link to the source. Do not filter, assess, or editorialize — just list them verbatim.

**Output format:**

```markdown
## Major Versions (Last 2 Years)

### vX.0.0 (YYYY-MM-DD)

**Breaking Changes:**
- Change description ([source](url))
- ...
```

If no major versions were released in the last 2 years, state that explicitly.

### 4. Compatibility Assessment

At the end of the document, include a `## Compatibility` section with:

- `compatible: true` or `compatible: false`
- If false, a `reason:` field explaining why

A framework is **incompatible** if it lacks:

- A client-side route tree or route matching mechanism
- Dynamic segment parameters
- Navigation lifecycle events that can be hooked into
- Examples: Shopify Hydrogen (server-only loaders), Salesforce Lightning (proprietary component model)

A framework is **compatible** even if:

- It uses file-based routing (as long as there's a runtime route representation)
- Some hooks fire later than ideal (trade-off is documented, not a blocker)

## Output

Write the result to `docs/integrations/<framework>/01-router-concepts.md`.
