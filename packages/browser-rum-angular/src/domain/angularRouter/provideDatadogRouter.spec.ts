// Must load before the other Angular imports (see createTestApplication)
import '@angular/compiler'
import type { EnvironmentProviders } from '@angular/core'
import { provideLocationMocks } from '@angular/common/testing'
import { Router, provideRouter } from '@angular/router'
import { createTestApplication } from '../../../test/createTestApplication'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogRouter, provideNoopDatadogRouter } from './provideDatadogRouter'

describe('provideDatadogRouter', () => {
  let startViewSpy: jasmine.Spy

  beforeEach(() => {
    startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: {
        router: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })
  })

  async function createRouter(providers: EnvironmentProviders[]) {
    const applicationRef = await createTestApplication([
      provideRouter([
        { path: 'foo', children: [] },
        { path: 'user/:id', children: [] },
      ]),
      provideLocationMocks(),
      providers,
    ])
    return applicationRef.injector.get(Router)
  }

  it('creates a new view when the router navigates', async () => {
    const router = await createRouter([provideDatadogRouter()])

    await router.navigateByUrl('/user/42?tab=1')

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/:id', url: '/user/42?tab=1' })
  })

  it('does not create a new view when only the query string changes', async () => {
    const router = await createRouter([provideDatadogRouter()])

    await router.navigateByUrl('/foo?tab=1')
    await router.navigateByUrl('/foo?tab=2')

    expect(startViewSpy).toHaveBeenCalledTimes(1)
  })

  it('does not create views with provideNoopDatadogRouter()', async () => {
    const router = await createRouter([provideDatadogRouter(), provideNoopDatadogRouter()])

    await router.navigateByUrl('/foo')

    expect(startViewSpy).not.toHaveBeenCalled()
  })
})
