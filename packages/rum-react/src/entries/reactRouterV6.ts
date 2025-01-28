/* eslint-disable local-rules/disallow-side-effects */

import {
  createBrowserRouter as originalCreateBrowserRouter,
  createHashRouter as originalCreateHashRouter,
  createMemoryRouter as originalCreateMemoryRouter,
  useRoutes as originalUseRoutes,
  useLocation,
  matchRoutes,
  createRoutesFromChildren,
} from 'react-router-dom-6'
import { wrapCreateRouter, createRoutesComponent, wrapUseRoutes } from '../domain/reactRouter'

export const createBrowserRouter = wrapCreateRouter(originalCreateBrowserRouter)
export const createHashRouter = wrapCreateRouter(originalCreateHashRouter)
export const createMemoryRouter = wrapCreateRouter(originalCreateMemoryRouter)

export const useRoutes = wrapUseRoutes({
  useRoutes: originalUseRoutes,
  useLocation,
  matchRoutes,
})

export const Routes = createRoutesComponent(useRoutes, createRoutesFromChildren)

export * from '../domain/reactRouter'
