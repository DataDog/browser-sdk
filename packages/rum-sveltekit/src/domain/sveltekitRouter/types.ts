/**
 * Minimal local types mirroring the subset of $app/navigation that the SvelteKit router
 * integration uses. These avoid a hard compile-time dependency on @sveltejs/kit types.
 */
export interface SveltekitRouteTarget {
  route: {
    id: string | null
  }
}

export interface SveltekitNavigation {
  /** Destination route. Null when the document is unloading (navigation.type === 'leave'). */
  to: SveltekitRouteTarget | null
  type: string
}
