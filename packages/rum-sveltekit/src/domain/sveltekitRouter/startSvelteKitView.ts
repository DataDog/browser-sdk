import { display } from '@datadog/browser-core'
import { onRumInit } from '../sveltekitPlugin'
import type { SvelteKitAfterNavigate } from './types'

/**
 * Start a new RUM view for the current SvelteKit navigation.
 *
 * Call this inside `afterNavigate` in your root +layout.svelte.
 * The browser guard is already applied internally — safe to call in SSR-rendered components.
 *
 * @example
 * ```svelte
 * <script>
 *   import { afterNavigate } from '$app/navigation'
 *   import { startSvelteKitRouterView } from '@datadog/browser-rum-sveltekit'
 *
 *   afterNavigate((navigation) => {
 *     startSvelteKitRouterView(navigation)
 *   })
 * </script>
 * ```
 */
export function startSvelteKitRouterView(navigation: SvelteKitAfterNavigate) {
  // afterNavigate fires on the server during SSR — only track views client-side.
  if (typeof window === 'undefined') {
    return
  }

  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(navigation.to.route.id))
  })
}

/**
 * Derive a stable view name from a SvelteKit route ID.
 *
 * SvelteKit exposes the parameterized route pattern directly as `route.id`
 * (e.g. '/blog/[slug]', '/(app)/dashboard'). This is already the ideal view
 * name: low-cardinality, stable, and human-readable.
 *
 * The only post-processing applied is stripping route group segments
 * `(groupName)` from the ID. Route groups scope layouts but do not appear in
 * URLs; including them in view names would produce names like `/(app)/dashboard`
 * that don't match what users see in the address bar.
 */
export function computeViewName(routeId: string | null): string {
  if (!routeId) {
    return '/'
  }
  return stripRouteGroups(routeId)
}

/**
 * Remove route group segments from a SvelteKit route ID.
 *
 * Route groups use parenthesised directory names, e.g. `(app)` or `(marketing)`.
 * They appear in `route.id` but not in the URL. Stripping them produces view
 * names that match the actual URL structure visible to the user.
 *
 * @example
 * stripRouteGroups('/(app)/dashboard')  // => '/dashboard'
 * stripRouteGroups('/blog/[slug]')       // => '/blog/[slug]'
 * stripRouteGroups('/')                  // => '/'
 */
function stripRouteGroups(routeId: string): string {
  // Match a slash followed by a parenthesised group name, e.g. `/(app)`.
  // The group name is one or more word characters and hyphens.
  return routeId.replace(/\/\([^)]+\)/g, '')
}
