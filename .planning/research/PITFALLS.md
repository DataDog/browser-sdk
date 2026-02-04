# Domain Pitfalls: SDK Code Generation + Remote Config Bundling

**Domain:** Code generation tool for bundled SDK + remote configuration
**Researched:** 2026-02-04
**Confidence:** MEDIUM (WebSearch + codebase analysis + official documentation)

## Critical Pitfalls

Mistakes that cause rewrites, production failures, or major architectural issues.

### Pitfall 1: Non-Deterministic Bundle Output

**What goes wrong:**
Code generator produces different output for the same inputs across builds, making it impossible to verify, cache, or reproduce bundles reliably. Users fetching the same SDK version + config combination get different code.

**Why it happens:**
- Build timestamps embedded in output
- Webpack chunk hashing includes randomness or build-time metadata
- DefinePlugin variables using `runtimeValue()` that change per build
- File iteration order dependency (filesystem traversal is non-deterministic)
- Environment-specific paths leaking into bundle (absolute paths)

**Consequences:**
- Cannot cache bundles effectively (each build = different hash)
- Impossible to verify "did config X produce bundle Y?"
- CDN cache invalidation becomes unreliable
- Self-hosted deployments cannot validate bundle integrity
- Debugging becomes nightmare (different users get different code)

**Prevention:**
1. **Lock all inputs**: Pin SDK version, config schema version, bundler version
2. **Deterministic webpack config**:
   - Use `chunkIds: 'named'` (already in webpack.base.ts)
   - Avoid DefinePlugin with runtime-dependent values for embedded config
   - Sort all file lists before processing
3. **Content-based hashing only**: Hash should depend purely on code + config content
4. **Test reproducibility**: Assert `generateBundle(inputs) === generateBundle(inputs)` in CI

**Detection:**
- Generate same bundle twice, compare byte-for-byte
- If hashes differ with identical inputs, output is non-deterministic
- CI test: build → rebuild → assert files match

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Must be core constraint from day 1
- Hard to retrofit after architecture is set

---

### Pitfall 2: Monorepo Dependency Resolution Mismatch

**What goes wrong:**
Code generator running in Node.js environment resolves packages differently than the bundled browser code expects. Generated bundle contains wrong versions of dependencies or fails to resolve packages that exist in the monorepo.

**Why it happens:**
- `require.resolve()` search paths depend on how Node.js loaded the generator script
- Yarn workspace hoisting creates different dependency trees than expected
- Code generator imports from workspace root while bundle expects scoped packages
- TypeScript path aliases (`@datadog/browser-core`) resolve differently in generator vs webpack

**Consequences:**
- Bundle includes duplicate versions of core packages (bundle size bloat)
- Runtime errors: "Cannot find module @datadog/browser-core"
- Generated code references wrong API versions
- Works in development, breaks in production (different resolution contexts)
- Impossible to trace which version was actually bundled

**Prevention:**
1. **Explicit package resolution**: Don't rely on Node's `require.resolve()`, use webpack's resolution
2. **Match workspace structure**: Generator should use same path resolution as webpack.base.ts (TsconfigPathsPlugin)
3. **Lock monorepo versions**: All workspace packages must use exact versions (6.26.0, not ^6.26.0)
4. **Validate bundle contents**: Post-build check that only expected packages are included
5. **Use workspace protocol**: Consider `workspace:*` in package.json for internal deps

**Detection:**
- Analyze bundle with webpack-bundle-analyzer
- Check for duplicate @datadog/* packages
- Verify bundle size is expected (not 2x due to duplicates)
- Runtime error: module not found

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Architecture decision: where does generator run, how does it resolve packages?

**Related:** [Monorepo Dependency Chaos: Proven Hacks](https://dev.to/alex_aslam/monorepo-dependency-chaos-proven-hacks-to-keep-your-codebase-sane-and-your-team-happy-1957), [Monorepo Dependency Management](https://medium.com/trabe/fine-tune-dependency-versions-in-your-javascript-monorepo-1fa57d81a2de)

---

### Pitfall 3: Embedded Config Not Actually Used by SDK

**What goes wrong:**
Code generator successfully embeds configuration into bundle, but SDK ignores it and still makes network request to fetch remote config. Defeats entire purpose of zero-request initialization.

**Why it happens:**
- SDK initialization code checks for remote config before checking for embedded config
- Embedded config format doesn't match SDK's expected schema
- Config is embedded but not passed to SDK's init function
- Race condition: SDK starts initialization before embedded config is available
- Config is embedded as string instead of parsed object (SDK can't use it)

**Consequences:**
- Users still see network request to config endpoint (zero-request promise broken)
- Increased latency (network round-trip still happens)
- Wasted bundle size (config embedded but unused)
- Silent failure (SDK works, just doesn't use embedded config)

**Prevention:**
1. **Integration testing required**: E2E test that verifies no network requests occur
2. **Schema validation**: Generator must validate config matches SDK's expected format
3. **Init flow modification**: SDK needs new initialization path for embedded config
4. **Detection mechanism**: SDK should log whether it used embedded vs fetched config
5. **Fail fast**: If embedded config is invalid, throw error at bundle generation time

**Detection:**
- Browser DevTools Network tab shows request to config endpoint
- SDK initialization logs don't mention "using embedded config"
- E2E test with network blocked should still work

**Phase to address:** Phase 2 (SDK Integration)
- Requires SDK code changes to support embedded config path
- Must coordinate with rum/rum-slim package modifications

---

### Pitfall 4: Tree Shaking Breaks Embedded Configuration

**What goes wrong:**
Webpack's tree shaking eliminates the embedded configuration code as "unused", resulting in bundle without config despite generator including it.

**Why it happens:**
- Config embedded as unused export that webpack eliminates
- `sideEffects: false` in package.json causes webpack to drop config initialization
- Config object not referenced from entry point (appears dead)
- Minifier removes config during terser optimization pass

**Consequences:**
- Bundle contains SDK code but no configuration
- Runtime error when SDK tries to access missing config
- Silent failure if SDK falls back to network fetch
- Works in development mode (tree shaking disabled), breaks in production

**Prevention:**
1. **Mark config module with side effects**: Add config file to `sideEffects` array in package.json
2. **Ensure config is imported**: Entry point must import config module, even if not directly used
3. **Use webpack magic comments**: `/* #__PURE__ */` or `/* #__NO_SIDE_EFFECTS__ */` carefully
4. **Test production builds**: Tree shaking only activates in production mode
5. **Bundle analysis**: Verify config is present in production bundle

**Detection:**
- Bundle size is smaller than expected (config was eliminated)
- Search bundle for config values (API key, etc.) - if missing, tree shaking removed it
- Production build fails while development works

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Webpack configuration must prevent config elimination
- Entry point structure critical

**Related:** [Tree Shaking Guide](https://webpack.js.org/guides/tree-shaking/), [sideEffects Configuration](https://dev.to/fogel/tree-shaking-in-webpack-5apj)

---

### Pitfall 5: Version Mismatch Between SDK and Config Schema

**What goes wrong:**
Generated bundle pairs SDK v6.26.0 with config schema from v6.25.0, causing runtime errors when SDK expects fields that don't exist in the config.

**Why it happens:**
- Generator fetches "latest" SDK and "latest" config independently
- Config schema evolves separately from SDK code
- Generator doesn't validate SDK version ↔ config schema compatibility
- User specifies SDK version but config version is auto-determined
- Cache contains old config for new SDK version

**Consequences:**
- Runtime TypeError: "Cannot read property 'newField' of undefined"
- SDK falls back to default config (defeats customization purpose)
- Silent degradation: some features don't work due to missing config
- Difficult debugging: version skew not obvious

**Prevention:**
1. **Version locking**: Config schema version must be tied to SDK version
2. **Compatibility matrix**: Document which config versions work with which SDK versions
3. **Validation at generation time**: Generator asserts SDK + config versions are compatible
4. **Semantic versioning**: Breaking config changes require SDK major version bump
5. **Schema versioning**: Include schema version in config metadata

**Detection:**
- Runtime errors in browser console mentioning config fields
- Unit tests fail when new SDK is paired with old config fixtures
- TypeScript type errors if config interface changes

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Design decision: how are versions specified and validated?

**Related:** [SDK Versioning Policy](https://help.split.io/hc/en-us/articles/360038143771-SDK-versioning-policy)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or reduced functionality.

### Pitfall 6: Build-Time Variables Leak into Generated Code

**What goes wrong:**
DefinePlugin replaces `__BUILD_ENV__*__` variables at webpack build time, but generator runs in different environment than end-user, causing wrong values to be embedded.

**Why it happens:**
- Generator runs in CI/staging, defines `__BUILD_ENV__DATACENTER__` as "us1"
- Customer is in "eu1" datacenter but bundle has "us1" hardcoded
- DefinePlugin runs at generator build time, not at bundle generation time
- Environment variables from generator host leak into output

**Consequences:**
- SDK sends data to wrong datacenter (us1 instead of eu1)
- Silent data loss or misrouting
- Cannot create multi-datacenter bundles from single generator
- Must rebuild generator for each datacenter

**Prevention:**
1. **Separate build-time from generation-time variables**:
   - Generator's build: OK to use DefinePlugin for generator code
   - Bundle generation: Must NOT embed generator's environment variables
2. **Use `keepBuildEnvVariables` option**: Already exists in webpack.base.ts, use it
3. **Runtime configuration**: Datacenter should come from config, not build variables
4. **Test across environments**: Generate bundle, verify no hardcoded environment values

**Detection:**
- Search bundle for datacenter strings (us1, eu1, etc.)
- Runtime: SDK sends requests to wrong endpoint
- Test: generate in us1 env, should work in eu1 env

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Webpack configuration must isolate generator vs bundle variables

**Related:** [DefinePlugin Documentation](https://webpack.js.org/plugins/define-plugin/), [DefinePlugin Pitfalls](https://github.com/webpack/webpack/issues/14883)

---

### Pitfall 7: Bundle Size Bloat from Unnecessary Dependencies

**What goes wrong:**
Generated bundle is 2-3x larger than expected because generator includes entire SDK dependency tree instead of just what's needed.

**Why it happens:**
- Generator imports full `@datadog/browser-rum` instead of just required modules
- Webpack bundles all of rum-core even though embedded config only needs subset
- External dependencies (pako compression) bundled when not needed
- Development utilities (error messages, debug logging) included in production bundle

**Consequences:**
- Slow page load (larger bundle)
- Wasted bandwidth (CDN serves unnecessary code)
- Defeats "slim" variant purpose (rum-slim bloats to rum size)
- Poor user experience on slow connections

**Prevention:**
1. **Analyze bundle composition**: Use webpack-bundle-analyzer on generated bundles
2. **Tree shaking configuration**: Ensure `sideEffects: false` in all SDK packages
3. **Conditional imports**: Only import required SDK modules for embedded config scenario
4. **Production-only builds**: Strip debug code with DefinePlugin + dead code elimination
5. **External dependencies**: Consider externalizing pako if not needed for embedded config

**Detection:**
- Bundle size exceeds expected: rum-slim should be <50KB, if it's >100KB, investigate
- webpack-bundle-analyzer shows unexpected modules
- Compare generated bundle size to standard CDN bundle size

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Entry point design determines what gets bundled

**Related:** [Bundle Size Optimization](https://about.codecov.io/blog/8-ways-to-optimize-your-javascript-bundle-size/)

---

### Pitfall 8: Incorrect Package Export Format for Self-Hosting

**What goes wrong:**
Generator tool published to npm works fine as CLI, but customers cannot import it as a library for custom build pipelines.

**Why it happens:**
- package.json only exports CLI entry point
- No ESM/CommonJS dual export
- TypeScript types not included
- Assumes tool is only used via command line

**Consequences:**
- Customers cannot integrate generator into their build systems
- Must shell out to CLI (slower, harder to debug)
- Cannot customize generation logic
- Poor developer experience for advanced use cases

**Prevention:**
1. **Dual export**: Provide both CLI and programmatic API
2. **Package.json exports**:
   ```json
   {
     "exports": {
       ".": {
         "import": "./esm/index.js",
         "require": "./cjs/index.js",
         "types": "./cjs/index.d.ts"
       },
       "./cli": "./bin/cli.js"
     }
   }
   ```
3. **TypeScript types**: Include .d.ts files for programmatic API
4. **Documentation**: Show both CLI and library usage

**Detection:**
- Try importing generator in a test project: `import { generateBundle } from '@datadog/bundle-generator'`
- TypeScript cannot find types
- Customer feedback: "how do I use this in webpack?"

**Phase to address:** Phase 3 (Packaging & Distribution)
- Not critical for initial version, but important for adoption

---

### Pitfall 9: Cache Invalidation Strategy Missing

**What goes wrong:**
CDN caches generated bundles indefinitely, so config updates don't reach users even when new bundles are generated.

**Why it happens:**
- Bundle URL doesn't include content hash: `datadog-rum-with-config.js`
- CDN cache-control headers set to long TTL without versioning
- No cache busting mechanism in URL structure
- Assumption that CDN invalidation API will be called (but it often isn't)

**Consequences:**
- Users receive stale config after updates
- Cannot roll out config changes quickly
- Must wait for CDN cache expiry (hours or days)
- Emergency config fixes don't propagate

**Prevention:**
1. **Content hash in URL**: `datadog-rum-config-{hash}.js` where hash = f(SDK version + config)
2. **Immutable cache headers**: Once deployed, bundle never changes
3. **Version in path**: `/v1/bundles/6.26.0/config-{hash}.js`
4. **Cache-Control**: `max-age=31536000, immutable` (1 year, safe because URL changes)
5. **Redirect from stable URL**: `/latest` → `/{hash}` for users who need stable URL

**Detection:**
- Update config, generate new bundle, old bundle still served
- CDN cache hit rate is 100% even after updates
- Users report not seeing config changes

**Phase to address:** Phase 4 (CDN Hosting & Distribution)
- Critical for production CDN deployment
- Affects URL structure decision

**Related:** [CDN Cache Invalidation](https://torvo.com.au/articles/why-cache-invalidation-doesnt-work), [Next.js CDN Caching](https://focusreactive.com/configure-cdn-caching-for-self-hosted-next-js-websites/)

---

### Pitfall 10: Missing Dependency Lockfile for Generator

**What goes wrong:**
Generator build uses `yarn install` without lockfile, pulling different webpack/terser versions across builds, causing non-deterministic output.

**Why it happens:**
- `.gitignore` includes `yarn.lock` for generator package (bad practice)
- CI runs `yarn install --no-lockfile`
- Floating dependencies (^5.0.0 pulls 5.1.0 later)
- Workspace hoisting changes dependency resolution over time

**Consequences:**
- Same inputs produce different outputs (breaks determinism)
- Impossible to reproduce builds locally
- CI build differs from local build
- Security vulnerabilities from unpinned dependencies

**Prevention:**
1. **Commit yarn.lock**: Lockfile must be in version control
2. **Strict mode**: Use `yarn install --immutable` in CI
3. **Exact versions**: Use exact versions for critical dependencies (webpack, terser)
4. **Lockfile validation**: CI fails if lockfile is outdated
5. **Dependency pinning**: Pin all devDependencies for generator

**Detection:**
- `yarn.lock` not in git
- CI builds differ from local builds
- Bundle hashes change without code/config changes

**Phase to address:** Phase 1 (Bundle Generation Logic)
- Project setup decision, must be correct from start

**Related:** [Lockfile Documentation](https://blog.inedo.com/npm/how-to-handle-npm-dependencies-with-lock-files), [Dependency Locking](https://medium.com/@franzandel/dependency-locking-real-world-use-case-in-android-3c9fe8b1b0cc)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 11: Poor Error Messages from Generator

**What goes wrong:**
Generator fails with "Error: failed to generate bundle" without indicating what went wrong (invalid config? wrong SDK version? network timeout?).

**Why it happens:**
- Generic error handling without context
- Nested errors swallowed (only top-level error shown)
- Validation errors not surfaced to user
- Assumes failures are self-explanatory

**Consequences:**
- User cannot fix the problem
- Support burden increases
- Poor developer experience
- Trial-and-error debugging

**Prevention:**
1. **Specific error messages**: "SDK version 6.26.0 not found in registry"
2. **Error context**: Include what was attempted, what failed, what to try next
3. **Validation feedback**: List all validation errors, not just first one
4. **Exit codes**: Different codes for different failure types (CLI)

**Detection:**
- User feedback: "I don't understand this error"
- Support tickets asking "what does this error mean?"

**Phase to address:** Phase 2 (CLI & Error Handling)

---

### Pitfall 12: Development vs Production Build Differences

**What goes wrong:**
Generator works perfectly in development mode but produces broken bundles in production mode due to webpack mode differences.

**Why it happens:**
- Development: minification off, source maps inline, tree shaking minimal
- Production: aggressive minification, tree shaking, no source maps
- Code works when readable, breaks when minified
- Tree shaking removes code that has side effects

**Consequences:**
- Cannot debug production issues with development builds
- CI/CD passes but production deployment breaks
- Difficult to reproduce issues locally

**Prevention:**
1. **Test production builds locally**: Make it easy to generate production bundle locally
2. **CI tests production mode**: Don't only test development builds
3. **Source maps in production**: Generate but don't inline (for debugging)
4. **Minimize mode differences**: Use similar webpack config for both

**Detection:**
- Works in development, fails in production
- Minified bundle has runtime errors
- Features disappear in production build

**Phase to address:** Phase 2 (Testing Strategy)

---

### Pitfall 13: TypeScript Path Aliases Break in Generated Code

**What goes wrong:**
Code imports `@datadog/browser-core` using TypeScript path alias, works in monorepo during development, but breaks in generated bundle because alias isn't resolved.

**Why it happens:**
- TsconfigPathsPlugin only active during webpack build
- Generated code still contains `import '@datadog/browser-core'`
- Bundle doesn't have access to workspace packages
- Webpack module resolution doesn't match TypeScript resolution

**Consequences:**
- Runtime error: "Cannot resolve module @datadog/browser-core"
- Works in monorepo, breaks as standalone bundle
- Confusing because TypeScript doesn't show errors

**Prevention:**
1. **TsconfigPathsPlugin in webpack.base.ts**: Already configured, verify it's active
2. **Resolve at build time**: Webpack must resolve all aliases to actual files
3. **Test bundle isolation**: Run generated bundle outside monorepo context
4. **Avoid workspace:* references in generated code**: Only use in package.json

**Detection:**
- Bundle contains unresolved import paths
- Runtime error in browser console
- Works when served from monorepo, breaks when deployed

**Phase to address:** Phase 1 (Bundle Generation Logic)
- webpack.base.ts already has TsconfigPathsPlugin, likely already handled

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: Bundle Generation Logic** | Non-deterministic output | Test: build twice, assert identical output |
| **Phase 1: Bundle Generation Logic** | Dependency resolution mismatch | Use webpack resolution, avoid Node require.resolve() |
| **Phase 1: Bundle Generation Logic** | Tree shaking removes config | Mark config module with side effects |
| **Phase 2: SDK Integration** | Embedded config not used | E2E test with network blocked |
| **Phase 2: SDK Integration** | Version mismatch SDK ↔ config | Version validation in generator |
| **Phase 3: CLI Tool** | Poor error messages | User testing with invalid inputs |
| **Phase 3: CLI Tool** | Missing programmatic API | Export both CLI and library interface |
| **Phase 4: HTTP Endpoint** | No cache invalidation strategy | Content-hash in URL from day 1 |
| **Phase 4: HTTP Endpoint** | Build-time variables leak | Isolate generator env from bundle env |
| **Phase 5: Self-Hosting** | Package export format wrong | Test as both CLI and library import |
| **Testing**: All phases | Only testing development builds | CI must test production mode |
| **Testing**: All phases | Integration testing missing | E2E with real browser, verify no network requests |

---

## General Recommendations

### Architecture Decisions That Prevent Multiple Pitfalls

1. **Content-addressable bundles**: Hash(SDK version + config) → URL
   - Solves: Cache invalidation, reproducibility, version tracking
   - Must decide in Phase 1

2. **Generator runs webpack, not string templating**: Use webpack to bundle, not code generation
   - Solves: Dependency resolution, tree shaking, minification
   - Must decide in Phase 1

3. **Lockfile committed and validated**: yarn.lock in git, CI uses --immutable
   - Solves: Non-deterministic builds, version drift
   - Must configure in Phase 1

4. **Dual package export (CLI + library)**: Support both use cases from start
   - Solves: Integration flexibility, adoption
   - Can defer to Phase 3, but design for it in Phase 1

### Testing Strategy to Catch Pitfalls Early

1. **Determinism test**: `assert(generate(inputs) === generate(inputs))`
2. **Bundle analysis test**: Assert bundle size within expected range
3. **Zero-request integration test**: E2E test with network blocked
4. **Production mode test**: CI tests production webpack mode, not just dev
5. **Isolation test**: Run generated bundle outside monorepo context
6. **Version matrix test**: Test SDK v{N} with config v{N}, v{N-1}, v{N+1}

### What to Flag for Deeper Research

- **Phase 2 (SDK Integration)**: Exact API for embedded config in rum/rum-slim
  - Needs investigation: how does SDK detect embedded config vs fetching?

- **Phase 4 (CDN Hosting)**: Infrastructure team coordination
  - Needs investigation: cache headers, URL structure, CDN provider capabilities

- **Phase 4 (HTTP Endpoint)**: Rate limiting, authentication
  - Needs investigation: how to prevent abuse of bundle generation endpoint

---

## Sources

### Code Generation & Bundling
- [Monorepo Dependency Chaos: Proven Hacks](https://dev.to/alex_aslam/monorepo-dependency-chaos-proven-hacks-to-keep-your-codebase-sane-and-your-team-happy-1957)
- [Fine-tune Dependency Versions in JavaScript Monorepo](https://medium.com/trabe/fine-tune-dependency-versions-in-your-javascript-monorepo-1fa57d81a2de)
- [Node.js Monorepo Survival Guide](https://medium.com/@amirilovic/the-node-js-monorepo-survival-guide-84c7ad9b89ad)

### Deterministic Builds & Reproducibility
- [Deterministic Build Systems](https://reproducible-builds.org/docs/deterministic-build-systems/)
- [Three Pillars of Reproducible Builds](https://fossa.com/blog/three-pillars-reproducible-builds/)
- [Deterministic Builds with C/C++](https://blog.conan.io/2019/09/02/Deterministic-builds-with-C-C++.html)

### Webpack & Tree Shaking
- [Tree Shaking - webpack](https://webpack.js.org/guides/tree-shaking/)
- [Tree Shaking and Code Splitting in webpack](https://blog.logrocket.com/tree-shaking-and-code-splitting-in-webpack/)
- [sideEffects Configuration](https://dev.to/fogel/tree-shaking-in-webpack-5apj)
- [Optimize JavaScript Bundle Size](https://about.codecov.io/blog/8-ways-to-optimize-your-javascript-bundle-size/)

### DefinePlugin & Build Variables
- [DefinePlugin - webpack](https://webpack.js.org/plugins/define-plugin/)
- [DefinePlugin Destructuring Issues](https://github.com/webpack/webpack/issues/14883)
- [Environment Variables with Webpack](https://medium.com/@tasha.pudin/how-to-use-environment-variables-with-webpack-3e7fbf1181f6)

### Versioning & Lockfiles
- [Dependency Locking Real World Use Case](https://medium.com/@franzandel/dependency-locking-real-world-use-case-in-android-3c9fe8b1b0cc)
- [How to Handle npm Dependencies with Lock Files](https://blog.inedo.com/npm/how-to-handle-npm-dependencies-with-lock-files)
- [SDK Versioning Policy](https://help.split.io/hc/en-us/articles/360038143771-SDK-versioning-policy)

### CDN & Caching
- [Why Cache Invalidation Doesn't Work](https://torvo.com.au/articles/why-cache-invalidation-doesnt-work)
- [Next.js CDN Caching for Self-hosted Websites](https://focusreactive.com/configure-cdn-caching-for-self-hosted-next-js-websites/)
- [CDN JS Best Practices](https://blog.blazingcdn.com/en-us/cdn-js-best-practices-minification-versioning-cache-bust-rules)

### SDK Development
- [What I Learned Building an Android SDK](https://www.droidcon.com/2025/12/16/what-i-learned-while-building-an-android-sdk-architecture-pitfalls-best-practices/)
- [Avoid Common Pitfalls: SDK Developer Mistakes](https://www.expertia.ai/career-tips/avoid-these-common-pitfalls-mistakes-sdk-developers-should-steer-clear-of-22782s)
