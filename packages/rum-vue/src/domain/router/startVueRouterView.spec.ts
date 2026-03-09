import { display } from '@datadog/browser-core'
import type { RouteLocationMatched } from 'vue-router'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { startVueRouterView, computeViewName } from './startVueRouterView'

describe('startVueRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeVuePlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startVueRouterView([{ path: '/' }, { path: 'user' }, { path: ':id' }] as unknown as RouteLocationMatched[])

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeVuePlugin({ configuration: {} })
    startVueRouterView([] as unknown as RouteLocationMatched[])
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the vue plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns empty string for empty matched array', () => {
    expect(computeViewName([])).toBe('')
  })

  it('concatenates nested paths', () => {
    expect(computeViewName([{ path: '/users' }, { path: ':id' }] as unknown as RouteLocationMatched[])).toBe(
      '/users/:id'
    )
  })

  it('handles absolute child paths', () => {
    expect(computeViewName([{ path: '/foo' }, { path: '/foo/bar' }] as unknown as RouteLocationMatched[])).toBe(
      '/foo/bar'
    )
  })
})
