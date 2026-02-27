import React from 'react'
import { usePathname, useParams } from 'next/navigation'
import { replaceMockable } from '../../../core/test'
import { appendComponent } from '../../../rum-react/test/appendComponent'
import { initializeNextjsPlugin } from '../../test/initializeNextjsPlugin'
import { DatadogRumProvider } from './DatadogRumProvider'

describe('DatadogRumProvider', () => {
  let startViewSpy: jasmine.Spy

  beforeEach(() => {
    startViewSpy = jasmine.createSpy('startView')
    initializeNextjsPlugin({ publicApi: { startView: startViewSpy } })
    startViewSpy.calls.reset()

    replaceMockable(usePathname, () => '/')
    replaceMockable(useParams, () => ({}))
  })

  it('starts a view on mount', () => {
    appendComponent(<DatadogRumProvider>content</DatadogRumProvider>)

    expect(startViewSpy).toHaveBeenCalledOnceWith('/')
  })
})
