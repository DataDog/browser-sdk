# Element stack attribution — SSR prototype

For all three frameworks on **one page with real Module Federation and real build-plugin instrumentation**, see [the federation playground](./federation/README.md), running at http://127.0.0.1:3110. The apps below exercise standalone SSR and hydration.

Three ways to associate a browser stack with a DOM boundary:

```ts
// Requires the SDK to be loaded, but can run before DD_RUM.init().
DD_RUM.attachElementStack(element)

// Does not require an SDK import or an initialized SDK.
element.dd_element_stack = new Error().stack

// DOM attribute alternative (creates an attribute mutation).
// Use the framework template bindings shown below.
```

The API captures the caller stack, strips its own frames, and stores it in a WeakMap. The property option stores the stack directly on the element. Neither changes HTML attributes or produces attribute mutations.

On pointer-down, the SDK snapshots the nearest ancestor's stack, crossing shadow roots. On the same element, a nonempty string property takes precedence over a nonempty attribute, then an API registration. Nested boundaries override outer boundaries. The stack is exposed as `context.elementStack` in `beforeSend` and resolved through the existing source-code context to attribute service/version. `handlingStack` keeps its existing meaning. The stack is not added to the outgoing event payload by this prototype.

## Framework examples

These are independent, traditional SSR apps without a federation shell. Each has separate API, custom-property, and DOM-attribute examples:

| App     | API example                           | Property example                           | Browser registration                     |
| ------- | ------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| Next.js | `next/app/api-boundary.tsx`           | `next/app/property-boundary.tsx`           | React callback ref in a Client Component |
| Nuxt    | `nuxt/app/components/ApiBoundary.vue` | `nuxt/app/components/PropertyBoundary.vue` | Vue `onMounted`                          |
| Angular | `angular/app.ts` (`ApiBoundary`)      | `angular/app.ts` (`PropertyBoundary`)      | Angular `afterNextRender`                |

All three actually render content on the server, then hydrate it. Next.js also passes Server Component content through the client boundaries. Angular is an isolated Angular 22 JIT SSR app; the repository's Angular 15 fixture is unchanged.

**Prototype boundary:** `registerPrototypeSource(new Error().stack, service)` simulates the metadata normally injected by the Datadog build plugin. It deliberately receives a stack captured in the MFE module. Remove these calls when using real build-plugin instrumentation. This playground validates the SDK and framework lifecycle behavior, not bundler-plugin support or a Module Federation deployment.

The root SDK init uses `service: 'shell'`; clicks should resolve to `checkout-next`, `checkout-nuxt`, or `checkout-angular`, version `1.0.0`. The `beforeSend` callback displays the result on the page and drops action events (view events cannot be dropped through `beforeSend`); no Datadog account or credentials are needed.

## Run

From the repository root:

```sh
yarn workspace @datadog/browser-rum build:bundle
node test/apps/element-stack-ssr/prepare.mjs

yarn --cwd test/apps/element-stack-ssr/next install
yarn --cwd test/apps/element-stack-ssr/nuxt install
yarn --cwd test/apps/element-stack-ssr/angular install
yarn --cwd test/apps/element-stack-ssr/angular build

node test/apps/element-stack-ssr/serve.mjs
```

- Next.js: http://127.0.0.1:3101
- Nuxt: http://127.0.0.1:3102
- Angular: http://127.0.0.1:3103

Click **API click**, **Property click**, or **Attribute click** and inspect the service/version and stack in the `beforeSend` output. All servers bind to the loopback interface. Stop the launcher with Ctrl+C. Rebuild the SDK and rerun `prepare.mjs` after changing SDK code; rebuild/restart Angular after changing its code.

## Verify

With the servers running and the repository's Playwright Chromium installed:

```sh
node --test test/apps/element-stack-ssr/verify.mjs
```

Twelve separate tests cover all three registration methods in each framework and server rendering with JavaScript disabled. They check server-rendered content in the HTTP response, hydration without framework errors, interactive controls, the resolved service/version, caller-stack exposure in `beforeSend`, and the absence of custom properties for WeakMap registration. The SDK unit tests additionally check nested boundaries, shadow DOM, invalid property values, no attribute mutations, pre-init registration, and pointer-down snapshots.

## SSR constraints

Registration only runs in the browser. Keep each capture/API call in the MFE's own bundle, rather than a shared wrapper bundle. The SDK must be loaded before the API callback runs; property registration has no such dependency. Clicks before registration do not have an element stack, and portals outside a boundary need their own registration. An MFE with only server code still needs a small browser entry point to use stack attribution. A stack cannot distinguish multiple services bundled into the same source URL.

For manual attribution, use `context.elementStack` alongside the existing `context.handlingStack` in `beforeSend` and match the MFE's bundle URL. Only source-code metadata resolution is simulated in these examples; the captured stacks and click events are real.

## Inline attribute bindings

The attribute is declared in each framework's template. `stack` starts undefined during SSR and the initial browser render, then receives `new Error().stack` in a browser-only lifecycle callback. This avoids a hydration mismatch and keeps server stacks out of the HTML.

```tsx
// React: setStack(new Error().stack) in useEffect.
<section data-dd-element-stack={stack}>...</section>
```

```vue
<!-- Vue: stack.value = new Error().stack in onMounted. -->
<section :data-dd-element-stack="stack">...</section>
```

```html
<!-- Angular: stack.set(new Error().stack) in afterNextRender. -->
<section [attr.data-dd-element-stack]="stack()">...</section>
```

React's attribute example uses `useEffect`; the API and property examples continue to use callback refs.
