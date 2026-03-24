/**
 * Minimal interface matching the shape of Angular's ActivatedRouteSnapshot
 * that we need for view name computation. Avoids importing @angular/router at runtime.
 */
export interface RouteSnapshot {
  routeConfig: { path?: string } | null
  children: RouteSnapshot[]
  outlet: string
  url: Array<{ path: string }>
}
