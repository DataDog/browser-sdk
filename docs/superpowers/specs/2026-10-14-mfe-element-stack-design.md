# MFE click attribution through element stacks

Status: implemented and independently reviewed, including direct WeakMap registration.

## Intent and scope

Replace the explicit element-metadata implementation in [PR #5098](https://github.com/DataDog/browser-sdk/pull/5098) with the recommended approach in the [RFC](https://datadoghq.atlassian.net/wiki/spaces/RUMP/pages/7277120424/RFC+-+click+action+attribution+for+MFE).

Automatic clicks do not have an application handling stack. An MFE registers its container from its own browser bundle, allowing subsequent clicks to reuse existing bundle metadata to identify service and version. Customers using manual attribution can inspect the same stack in beforeSend.

The user chose only the recommended attachElementStack API, registration both before and after init, and direct registration in an instance-owned WeakMap from the public API. Remove the old setElementContext API, ElementContext export, dd_service/dd_version/dd_context properties, data-dd-context support, and their feature-specific tests from the PR's final diff.

Do not add the RFC's alternative dd_element_stack property or data-dd-element-stack attribute. Do not introduce custom context merging, framework integrations, a new demo application, dependencies, or a new event-schema field. PR #5134 is a reference prototype only; its demo and alternative APIs are outside this change.

## Public API and lifecycle

Expose attachElementStack(element: Element): void on the shared RUM public API used by RUM and RUM Slim.

Customers register the container from the MFE's browser bundle whenever the SDK API is available, before or after init. Asynchronously loaded SDKs require onReady. Server rendering must not capture the registration stack; registration occurs on mount or hydration in the browser.

Registration always captures and stores the stack immediately, including before init, without a lifecycle warning, initialization guard, or buffered registration call. Customers do not need to register again after init. Create the WeakMap in makeRumPublicApi and write to it directly from attachElementStack. Pass the same registry through the startup callback into startRum, then action collection and click tracking. Registration does not delegate to a strategy. Registrations survive initialization and deferred startup because the registry is never replaced.

Registration does not start tracking, emit events, or bypass configuration validation or consent. The registry is available from public API creation; click tracking uses it when RUM starts.

Repository-driven clarification: createHandlingStack strips a fixed number of SDK frames and must run at the public API entry point outside monitoring wrappers. Capture the stack there synchronously, then store it directly in the registry within the normal monitoring boundary. Do not capture it inside a strategy method, buffered callback, or monitored wrapper. The builder can choose the smallest internal method signatures needed to pass the registry through startup to click tracking.

## Storage and lookup

Use an instance-owned WeakMap<Element, string>, shared by registration and click tracking, without DOM mutations or global cross-instance registrations. It should not keep removed elements alive. Do not use a strong Map, a buffered callback retaining an element, or a WeakRef fallback. WeakRef is unavailable in some supported browsers (Chrome/Edge 80, Firefox 78, and Safari 14.0); immediate WeakMap registration avoids that compatibility dependency.

At pointerdown, search the clicked target followed by its ancestors using existing SDK DOM traversal conventions, including crossing shadow roots. Use the first registered element's stack. Do not combine stacks or search a more distant boundary just because the closest stack has no matching build metadata.

Assistant defaults proposed for approval:

- Re-registering the same element replaces its stack for future actions.
- A detached element may be registered before or after init; the registration applies when that same element is mounted. New replacement elements require registration.
- No unregister API is introduced. WeakMap lifetime and replacement cover this scope.
- If stack capture is unavailable, preserve normal click collection without element attribution; a failed registration should not install an invalid stack or erase an existing valid registration.

## Action snapshot and attribution

Copy the selected stack string into the automatic action's state at its initial pointerdown. Subsequent DOM changes, registration replacement, removal, or asynchronous action completion do not change this snapshot.

Assistant default proposed for approval: an existing rage-click group retains the initial action's stack. Do not change click grouping rules. Later independent actions use the registration current at their own initial pointerdown.

Carry the snapshot as elementStack in the automatic action's domain context. Extend the existing sourceCodeMfeContext attribution hook to resolve this stack using the existing source-code metadata machinery. Preserve existing precedence and behavior for other event types. Avoid introducing a second service/version resolver or populating a misleading handlingStack for automatic clicks.

Expose the optional context.elementStack string to beforeSend for automatic click actions, alongside existing callback context. Keep the raw stack out of the serialized RUM event. If no boundary exists, omit elementStack and preserve current attribution. If a boundary exists but build metadata does not match, expose its stack for manual attribution and preserve existing fallback service/version behavior. Customers retain their normal beforeSend ability to override event service/version.

## Verification

Use existing Jasmine/Karma unit tests and microfrontend E2E infrastructure. Cover public API availability in RUM and RUM Slim; immediate pre-init registration without warnings and its preservation through init; registration during deferred startup; caller stack frames; repeated registration; closest ancestor and shadow-root traversal; instance isolation; and unchanged action snapshots after DOM or registration changes, including rage clicks.

Verify automatic attribution using build-plugin metadata, manual attribution through beforeSend, shell fallback, unmatched nearest boundaries, and absence of serialized stacks. Adapt the existing microfrontend test application as needed without importing the prototype's separate demonstration application.

Run focused unit tests, relevant E2E scenarios, type checking, lint/format checks, and diff checks. Investigate any remaining WebKit failures instead of assuming the previous PR's intake failure still applies. Follow repository cleanup and test conventions, use Yarn, and do not manually modify generated types.

## Delivery and builder discretion

Update the existing PR branch amortemousque/mfe-click-action-attribution. Preserve unrelated local files and worktrees. Replace the old feature in the final diff without assuming a destructive branch reset or force push is necessary. Update the PR description to the final behavior and actual validation results using the repository template and amortemousque GitHub account.

The builder chooses helper names, module placement, and test organization. Preserve the public contract above. Any newly discovered need for generated schema changes or additional public APIs requires revisiting scope.

This document will be committed with the PR work; it is initially drafted in the current checkout to avoid modifying the existing PR worktree before its state is checked. After approval, prepare the implementation plan before product code changes.
