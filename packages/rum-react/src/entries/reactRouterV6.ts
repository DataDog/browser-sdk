/* eslint-disable local-rules/disallow-side-effects */

import {
  createBrowserRouter as originalCreateBrowserRouter,
  createHashRouter as originalCreateHashRouter,
  createMemoryRouter as originalCreateMemoryRouter,
  useRoutes as originalUseRoutes,
  useLocation,
  matchRoutes,
  createRoutesFromChildren,
} from 'react-router-dom'
import { wrapCreateRouter, createRoutesComponent, wrapUseRoutes } from '../domain/reactRouter'

/** @function */
export const createBrowserRouter = wrapCreateRouter(originalCreateBrowserRouter)

/** @function */
export const createHashRouter = wrapCreateRouter(originalCreateHashRouter)

/** @function */
export const createMemoryRouter = wrapCreateRouter(originalCreateMemoryRouter)

/** @function */
export const useRoutes = wrapUseRoutes({
  useRoutes: originalUseRoutes,
  useLocation,
  matchRoutes,
})

export type { AnyLocation } from '../domain/reactRouter'

/** @function */
export const Routes = createRoutesComponent(useRoutes, createRoutesFromChildren)
