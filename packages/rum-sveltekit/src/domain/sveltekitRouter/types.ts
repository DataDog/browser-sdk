/**
 * Minimal local types for SvelteKit navigation data.
 *
 * These mirror the subset of SvelteKit's AfterNavigate interface that
 * startSvelteKitRouterView needs. Using local types avoids a hard runtime
 * import from '@sveltejs/kit' in this file while remaining structurally
 * compatible with the real types.
 */

export interface SvelteKitNavigationTarget {
  route: {
    id: string | null
  }
}

export interface SvelteKitAfterNavigate {
  to: SvelteKitNavigationTarget
}
