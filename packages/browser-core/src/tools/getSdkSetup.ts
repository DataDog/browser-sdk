// replaced at build time
declare const __BUILD_ENV__SDK_SETUP__: 'npm' | 'cdn'

/**
 * The distribution channel this bundle was built for: `'cdn'` for the CDN bundles (webpack) and
 * `'npm'` for the published packages (esbuild). See `scripts/lib/buildEnv.ts`.
 *
 * Call sites should wrap this with `mockable()` so tests can exercise the other channel.
 */
export function getSdkSetup() {
  return __BUILD_ENV__SDK_SETUP__
}
