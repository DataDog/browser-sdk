# MFE Element Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace PR #5098's explicit element metadata with attachElementStack and automatic click attribution from the registered caller stack.

**Architecture:** makeRumPublicApi owns a WeakMap<Element, string> and registers synchronously, before or after init. Its existing startup callback passes that map to startRum, action collection, and click tracking; automatic actions snapshot the nearest boundary's stack and reuse sourceCodeMfeContext.

**Tech Stack:** TypeScript, Yarn workspaces, Jasmine/Karma, Playwright.

**Spec:** ../specs/2026-10-14-mfe-element-stack-design.md (approved in chat, including direct WeakMap registration).

## Global Constraints

- Only attachElementStack(element: Element): void; no explicit context API, property, attribute, WeakRef, new dependencies, or demo application.
- Registration happens immediately before or after init; no warnings, guards, buffering, or strategy delegation for registration.
- Use one WeakMap per public API instance. Capture the stack at the public API entry point outside monitoring wrappers.
- Preserve initial pointerdown attribution through DOM changes and rage-click aggregation; nearest registered boundary wins even if its metadata does not match.
- Stack belongs in beforeSend context, never the serialized event.
- Supported minimums include Chrome/Edge 80, Firefox 78, Safari 14.0. Do not manually edit generated types.
- Use Yarn, existing cleanup helpers, camelCase internals, gitmoji commits, and the existing PR template. Publish as amortemousque.
- Preserve unrelated files and existing worktree changes. Do not force push or reset the user's checkout.

## Review Focus

- Registration during deferred startup must survive the transition without requiring another call (Task 1).
- Detached, nested shadow-root, and replacement elements must have predictable identity-based lookup (Task 1).
- Failed stack capture must leave a previous valid registration intact (Task 1).
- A nearest unmatched boundary must not fall through to a farther matched ancestor (Tasks 1 and 2).
- Real build-plugin attribution must resolve the caller bundle, rather than an SDK wrapper frame (Tasks 1 and 3).

## File structure

- Add packages/browser-rum-core/src/domain/action/elementStack.ts and elementStack.spec.ts: nearest-boundary lookup over a supplied registry.
- Change boot/rumPublicApi.ts and its spec: registry ownership, API entry point, and startRum dependency injection.
- Change boot/startRum.ts, action/actionCollection.ts, action/trackClickActions.ts and their existing specs: pass registry and snapshot elementStack.
- Change domainContext.types.ts and domain/contexts/sourceCodeMfeContext.ts plus its spec: callback context and existing attribution resolver.
- Change packages/browser-core/src/tools/stackTrace/handlingStack.ts: permit the 'element' stack label.
- Remove old PR elementContext files, metadata-only tests, and ElementContext exports from browser-rum-core/src/index.ts and RUM/RUM Slim entries; remove obsolete rawRumEvent.types.ts changes.
- Adapt test/apps/microfrontend/app1.ts, app2.ts, common.ts and test/e2e/scenario/microfrontend.scenario.ts for browser-level attribution coverage. Extend existing assembly tests only where needed to prove stack omission from payloads.

### Task 1: Replace explicit metadata with immediate weak registration

**Interfaces:**

- Public: attachElementStack(element: Element): void.
- Lookup: getElementStack(element: Element, elementStacks: WeakMap<Element, string>): string | undefined in elementStack.ts.
- Add required elementStacks: WeakMap<Element, string> immediately before startRum's optional sdkName parameter. The existing startup closure captures it; DoStartRum and pre-start buffering do not need a new argument.

- [x] Inspect remote PR head and existing worktrees using the worktree skill. The existing PR worktree at /Users/aymeric.mortemousque/.codex/worktrees/0596/browser-sdk has uncommitted elementContext.ts and elementContext.spec.ts edits. Leave it untouched and use a new managed worktree at the verified PR head. Copy the approved design and this plan there and commit them. Record the starting remote SHA for safe publication.
- [x] Remove only #5098's old explicit-context implementation and related test additions, using its original diff as the removal inventory. Preserve all unrelated baseline code. Remove ElementContext exports and old event-type additions. Do not import the prototype branch wholesale.
- [x] Add failing elementStack.spec.ts tests for target/ancestor precedence, unregistered target, shadow host traversal, detached elements, and separate registries. Representative assertions:

```ts
elementStacks.set(parent, 'parent-stack')
expect(getElementStack(child, elementStacks)).toBe('parent-stack')
elementStacks.set(child, 'child-stack')
expect(getElementStack(child, elementStacks)).toBe('child-stack')
expect(getElementStack(child, new WeakMap())).toBeUndefined()
```

- [x] Run `yarn test:unit --spec packages/browser-rum-core/src/domain/action/elementStack.spec.ts`; confirm failure due to missing lookup implementation.
- [x] Implement lookup using existing DOM traversal conventions, crossing shadow roots via their host. Return the first registered stack without parsing metadata. Do not retain elements outside the WeakMap.
- [x] Add public API tests: registration before init without warnings; post-init replacement; preserved registration with deferred manual-view startup; instance isolation; unavailable capture preserving prior stack. Use existing startRum mocking to inspect the passed registry. Parse a captured stack and assert its first frame belongs to the calling test, not rumPublicApi or monitoring code.
- [x] Run `yarn test:unit --spec packages/browser-rum-core/src/boot/rumPublicApi.spec.ts`; confirm the new tests fail for the absent API.
- [x] In makeRumPublicApi, create the registry and implement attachElementStack using createHandlingStack('element') at the outer API entry point, followed by monitored storage only when capture is usable. Pass the same map to startRum through the current startup closure. Extend the stack label union and API JSDoc. Update direct startRum test callers for the required dependency; no singleton registry or default replacement map.
- [x] Run both focused spec commands above and `yarn typecheck`; expect passing results. Commit the registration change with a gitmoji message.

### Task 2: Snapshot element stacks and reuse event attribution

**Interfaces:**

- Append required elementStacks: WeakMap<Element, string> to startActionCollection and trackClickActions; thread through pointerdown helpers.
- Add elementStack?: string to ClickAction, include it in ClickActionBase, and add the same optional property to RumActionEventDomainContext.
- Consume getElementStack from Task 1. No new public exports beyond the public API method.

- [x] Add failing click-tracking tests: nearest registered stack captured on pointerdown; removing/moving the element or replacing registration before completion leaves the action snapshot unchanged; the next independent action sees the replacement; rage groups keep the initial snapshot. For the replacement case assert first completed action.elementStack equals 'first-stack' and the next equals 'second-stack'. Exercise existing clone/finalize paths without changing grouping rules.
- [x] Run `yarn test:unit --spec packages/browser-rum-core/src/domain/action/trackClickActions.spec.ts`; confirm the new snapshot assertions fail.
- [x] Pass the map from startRum to action collection and click tracking. Resolve the stack during computeClickActionBase using the existing event target helper. Store only the string in action state and preserve it through cloning and aggregation. Update direct test callers with an explicit map.
- [x] Add action-collection tests asserting the stack is present in domainContext.elementStack alongside events and absent from rawRumEvent. Add sourceCodeMfeContext tests for registered matching stack, missing stack, unmatched top frame, and preservation of existing manual-action/error behavior. Add an assembly test proving beforeSend can override service/version and the element stack is absent from the serialized event.
- [x] Run focused specs for actionCollection, sourceCodeMfeContext, and assembly; confirm new assertions fail before implementing their behavior.
- [x] Carry elementStack in automatic-action domain context only. Extend getSourceUrl in sourceCodeMfeContext to select it for automatic actions while keeping existing handling/error-stack precedence for other cases. Use the existing first-frame URL resolver; no independent service/version merger.
- [x] Run the four affected focused spec commands, `yarn typecheck`, and `yarn test:compat:tsc`; expect passing results. Commit with a gitmoji message.

### Task 3: Prove browser behavior and update the existing PR

**Interfaces:** Use the public attachElementStack method and beforeSend context.elementStack from Tasks 1–2. Test through real bundle metadata and the existing microfrontend setup.

- [x] Read test/e2e/AGENTS.md and inspect the existing microfrontend app initialization and metadata configuration. Add opt-in registration calls inside app1/app2 bundles, so their stacks identify those bundles without changing existing scenarios. Choose an existing app-configuration channel to enable registration for the new scenarios.
- [x] Replace #5098's three metadata-form scenarios with API scenarios using withRumSlim: clicks in each MFE resolve their existing configured service/version; an unregistered shell click retains shell attribution. Assert no elementStack appears in intake payloads.
- [x] Add a manual beforeSend attribution scenario that receives elementStack and sets explicit service/version. Add pre-init registration coverage through the existing withRumInit/setup facilities and verify a later click retains that registration. Assert observable collected events rather than reaching into the registry.
- [x] Run `yarn build` then `yarn build:apps --app microfrontend`. Run `yarn test:e2e microfrontend.scenario.ts --project chromium --project firefox --project webkit`. Expect new and existing scenarios to pass; diagnose any WebKit intake failure using the existing baseline instead of silently excluding it.
- [x] Run `yarn typecheck`, `yarn test:compat:tsc`, ESLint and Prettier checks on changed files, and `git diff --check`. Run the focused unit suites after any changes affecting them. Report environment-blocked checks accurately.
- [x] Review the final branch diff against main: only the recommended API remains, no generated files were hand-edited, no alternative prototype/demo work was imported, and unrelated local changes remain untouched. Perform the chosen execution workflow's final code review and resolve actionable findings. Commit the integration tests and any review fixes.
- [ ] Check `gh auth status` and switch to amortemousque if necessary. Verify the remote PR head has not changed unexpectedly; reconcile newer commits if it has. Push the new commits to amortemousque/mfe-click-action-attribution without force, using per-command HTTPS credential overrides only if needed.
- [ ] Rewrite #5098's title/body using .github/PULL_REQUEST_TEMPLATE.md, covering the final API, before-init semantics, pointerdown snapshots, and actual test results. Remove stale explicit-context claims and obsolete validation counts. Keep the PR draft unless the user asks otherwise; do not merge. Reattach the PR artifact and report the final commit and material validation limits.

## Self-review

The tasks cover immediate pre-init storage, startup propagation, weak lifetime, replacement, nearest boundary lookup, shadow roots, action snapshots, rage grouping, existing attribution, beforeSend, RUM/Slim integration, removal of the previous feature, and safe publication. Garbage collection itself is not asserted through timing-sensitive tests: weak ownership is verified structurally, while tests cover isolation and behavior. The approved plan was executed inline and independently reviewed with no actionable findings.

## Validation record

- Full unit suite: 5,301 passed; focused feature suites: 226 passed.
- Typecheck, all TypeScript compatibility modes, changed-file ESLint/Prettier, and diff whitespace checks passed.
- Chromium/Firefox microfrontend regression: 111 passed, 3 existing skips. All 18 new cases passed across Chromium, Firefox, and WebKit.
- WebKit baseline unload delivery failed independently of this feature. New WebKit cases verify regular periodic intake before navigation; production transport is unchanged.
- Local browser runs used built fixtures and a temporary configuration for the hidden managed worktree. Original checkout and existing worktree edits were preserved.
