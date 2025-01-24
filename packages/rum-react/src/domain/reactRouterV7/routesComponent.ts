import type { Routes as OriginalRoutes } from 'react-router-7'
import { createRoutesFromChildren } from 'react-router-7'
import { useRoutes } from './useRoutes'

// Same as react-router-dom Routes but with our useRoutes instead of the original one
// https://github.com/remix-run/react-router/blob/5d66dbdbc8edf1d9c3a4d9c9d84073d046b5785b/packages/react-router/lib/components.tsx#L503-L508
export const Routes: typeof OriginalRoutes = ({ children, location }) =>
  useRoutes(createRoutesFromChildren(children), location)
