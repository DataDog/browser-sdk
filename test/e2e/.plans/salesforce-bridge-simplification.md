# Salesforce Bridge Simplification

## Context
Current Salesforce e2e setup uses `window.__ddSfTestEvents` array + `syncRegistry()` pattern to get events from the browser into the Node.js registry. All waiting logic runs inside `page.evaluate()` with browser-side event listeners and timeouts. This is ~200 lines of brittle complexity. The developer extension already shows the clean pattern: `__ddBrowserSdkExtensionCallback` → CustomEvent. We can use Playwright's `page.exposeFunction` to bridge directly into the Node.js registry, eliminating all browser-side polling.

## Approach

### `sfRegistry.ts`
- Replace `load(events[])` with `add(event: BridgeEvent)` — registry is push-based, not pull
- Remove `BRIDGE_EVENT_NAME` and `BRIDGE_INIT_SCRIPT` exports (move to `createSalesforceTest.ts`)
- Keep all getters unchanged

### `createSalesforceTest.ts`
1. Before navigation: `page.exposeFunction('__ddSfOnBridgeEvent', (event) => sfRegistry.add(event))`
2. `addInitScript`: `window.__ddBrowserSdkExtensionCallback = (msg) => __ddSfOnBridgeEvent(msg)`
3. Delete `syncRegistry()`, `waitForRumVersion()`, `waitForRumEventType()`, `waitForUniqueRumViews()`
4. Replace all `page.evaluate(new Promise(...))` waiting with simple Node.js polling:

```typescript
async function waitFor(condition: () => boolean, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message)
    await new Promise(r => setTimeout(r, 100))
  }
}
```

5. `waitForRumEvent` → `waitFor(() => sfRegistry.rumEvents.filter(e => e.type === type).length >= minCount, ...)`
6. `waitForUniqueViews` → `waitFor(() => sfRegistry.rumUniqueViewEvents.length >= count, ...)`
7. `waitForSdkVersion` → `waitFor(() => sfRegistry.rumEvents.some(e => e.version === sha), ...)`

## Files
- `test/e2e/lib/framework/salesforce/sfRegistry.ts`
- `test/e2e/lib/framework/salesforce/createSalesforceTest.ts`

## Verification
Run `yarn test:e2e --config test/e2e/playwright.salesforce.config.ts` (or the Salesforce-specific config) to verify the tests still pass.

## Unresolved questions
- None
