/**
 * Minimal local types mirroring Angular Router's ActivatedRouteSnapshot shape.
 * Avoids runtime imports from @angular/router — only the fields that
 * computeViewName() and trackRouterViews() actually use are typed here.
 */

export interface AngularRouteConfig {
  path?: string
}

export interface AngularActivatedRouteSnapshot {
  routeConfig: AngularRouteConfig | null
  firstChild: AngularActivatedRouteSnapshot | null
  pathFromRoot: AngularActivatedRouteSnapshot[]
}
