import type { AnyLocation, AnyRouteObject, AnyUseRoute } from './types'
// Same as react-router-dom Routes but with our useRoutes instead of the original one
// https://github.com/remix-run/react-router/blob/5d66dbdbc8edf1d9c3a4d9c9d84073d046b5785b/packages/react-router/lib/components.tsx#L503-L508
export function createRoutesComponent<Location extends AnyLocation>(
  useRoutes: AnyUseRoute<Location>,
  createRoutesFromChildren: (children: React.ReactNode, parentPath?: number[]) => AnyRouteObject[]
) {
  return function Routes({ children, location }: { children: React.ReactNode; location?: Location }) {
    return useRoutes(createRoutesFromChildren(children), location)
  }
}
