// Minimal local types mirroring the subset of @angular/router we actually consume.
// Defined here to avoid a runtime dependency on @angular/router for consumers that
// only use the main plugin entry.

export interface AngularActivatedRouteSnapshot {
  routeConfig: { path?: string } | null
  firstChild: AngularActivatedRouteSnapshot | null
}
