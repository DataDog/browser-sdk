// These types are used by our instrumentation functions to work with @solidjs/router
// without importing its types directly, keeping the integration decoupled from a
// specific router version.
//
// These types should be:
// * compatible with all @solidjs/router versions we support (>=0.11.0)
// * include only the attributes used by our instrumentation functions.

export interface AnyRouteMatch {
  route: {
    /**
     * The parameterized route path as defined by the developer,
     * e.g. '/users/:id', '/stories/:id?', 'foo/*any'
     */
    path: string
  }
}
