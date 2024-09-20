import type { RouteMatch } from 'react-router-dom'
import { display } from '@datadog/browser-core'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { computeViewName, startReactRouterView } from './startReactRouterView'

describe('startReactRouterView', () => {
  it('creates a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        router: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })

    startReactRouterView([
      { route: { path: '/' } },
      { route: { path: 'user' } },
      { route: { path: ':id' } },
    ] as RouteMatch[])

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('displays a warning if the router integration is not enabled', () => {
    const displayWarnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {},
    })

    startReactRouterView([] as RouteMatch[])
    expect(displayWarnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the react plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string if there is no route match', () => {
    expect(computeViewName([] as RouteMatch[])).toBe('')
  })

  it('returns the path of the first route match', () => {
    expect(computeViewName([{ route: { path: '/foo' } }] as RouteMatch[])).toBe('/foo')
  })

  it('concatenates the paths of all route matches', () => {
    expect(
      computeViewName([
        { route: { path: '/foo' } },
        { route: { path: 'bar' } },
        { route: { path: ':id' } },
      ] as RouteMatch[])
    ).toBe('/foo/bar/:id')
  })

  it('ignores routes without a path', () => {
    expect(
      computeViewName([{ route: { path: '/foo' } }, { route: {} }, { route: { path: ':id' } }] as RouteMatch[])
    ).toBe('/foo/:id')
  })

  it('handles absolute paths', () => {
    expect(
      computeViewName([
        { route: { path: '/foo' } },
        { route: { path: '/bar' } },
        { route: { path: '/:id' } },
      ] as RouteMatch[])
    ).toBe('/:id')
  })

  it('removes intermediary trailing slashes', () => {
    expect(
      computeViewName([
        { route: { path: '/foo/' } },
        { route: { path: 'bar/' } },
        { route: { path: ':id/' } },
      ] as RouteMatch[])
    ).toBe('/foo/bar/:id/')
  })

  it('replaces match-all routes with the actual path', () => {
    expect(
      computeViewName([
        { route: { path: '/foo' } },
        {
          params: { '*': 'bar' },
          pathname: '/bar',
          pathnameBase: '/',
          route: { path: '*' },
        },
      ] as RouteMatch[])
    ).toBe('/foo/bar')
  })
})
