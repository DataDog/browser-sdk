# One shell, three federated frameworks

Open **http://127.0.0.1:3110**.

This app uses `@module-federation/enhanced/webpack` to load three independently built remote containers into a single page. There are no iframes. The shell initializes one Browser RUM SDK; each remote registers its own boundaries using three alternatives:

```js
DD_RUM.attachElementStack(element)
element.dd_element_stack = new Error().stack
// Use the framework template bindings shown below.
```

Each stack is captured in the browser. The closest annotated ancestor wins; on the same element the custom property takes precedence over the attribute, then the API registration. Empty/whitespace attributes are ignored. Unlike the WeakMap-backed API, setting an attribute produces a DOM mutation.

| Remote  | Components                                            | Service           | Version | Remote entry                           |
| ------- | ----------------------------------------------------- | ----------------- | ------- | -------------------------------------- |
| React   | Same client boundaries as the Next.js SSR prototype   | `checkout-react`  | `1.1.0` | `http://127.0.0.1:3111/remoteEntry.js` |
| Vue     | Same components as the Nuxt SSR prototype             | `catalog-vue`     | `2.2.0` | `http://127.0.0.1:3112/remoteEntry.js` |
| Angular | Same boundary components as the Angular SSR prototype | `account-angular` | `3.3.0` | `http://127.0.0.1:3113/remoteEntry.js` |

The shell falls back to `mfe-shell`, version `0.1.0`. It knows how to mount and unmount remotes, but does not annotate their DOM elements or assign their click attribution.

## Real source-code metadata

`webpack.config.cjs` applies the **real Datadog webpack plugin** to each remote with a different service/version. There is no synthetic source-code registry in this composed app. The metadata helper used by the standalone SSR examples is disabled here; their stack capture code is reused unchanged.

Click **API click**, **Property click**, or **Attribute click** in any remote. The table shows attribution from `beforeSend`, and the expandable section shows captured stacks. The callback drops action events. View events cannot be dropped through `beforeSend`; this demo uses an invalid local token, not production credentials. **Unmount / Mount** exercises framework cleanup and fresh boundary registration.

## Framework scope

This app is client-rendered. The shell serves empty mount containers, then loads each remote through Module Federation. Each remote mounts its own framework and registers its boundaries. There are no server renderers, HTML-fragment composition, or hydration adapters in this app. Module Federation's [Next.js integration does not support App Router](https://module-federation.io/integrations/framework/nextjs/), so the React components from the Next.js prototype are exposed through a separate webpack build. The Vue components are likewise exported without Nuxt's router or server runtime. The standalone SSR apps remain available on ports 3101–3103 to exercise hydration separately.

Each remote owns its framework runtime. Nothing is shared across remotes in this prototype; this intentionally tests isolated framework instances while using the shell's single SDK.

## Run

From the repository root, with root dependencies installed:

```sh
yarn workspace @datadog/browser-rum build:bundle
yarn --cwd test/apps/element-stack-ssr/federation install
yarn --cwd test/apps/element-stack-ssr/federation build
yarn --cwd test/apps/element-stack-ssr/federation start
```

Only the federation package's dependencies are needed for this page; the standalone framework servers do not need to run. The server serves the current SDK bundle directly from this worktree. All four ports bind to `127.0.0.1`.

Rebuild the federation package after changing a remote or the shell; refresh the browser afterward. The mount adapters in `react/`, `vue/`, and `angular/` return a cleanup function and own all framework lifecycle operations.

## Verify

With the shell/remotes running:

```sh
node --test test/apps/element-stack-ssr/federation/verify.mjs
yarn tsc --noEmit --project test/apps/element-stack-ssr/federation/tsconfig.json
```

Fifteen separate Chromium checks cover all three attribution paths in all three remotes, real remote-entry loading, caller URLs pointing to the correct remote origin, unmount/remount, shell fallback, and sequential clicks across frameworks. A check also verifies that the initial HTML contains empty remote containers. Tests use the repository's Playwright installation.

SSR and hydration are tested separately in the traditional [Next.js, Nuxt, and Angular apps](../README.md) on ports 3101–3103.

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
