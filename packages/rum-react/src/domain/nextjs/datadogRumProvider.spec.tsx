import React from 'react'
import { replaceMockable } from '@datadog/browser-core/test'
import { usePathname, useParams } from 'next/navigation'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import { DatadogRumProvider } from './datadogRumProvider'

describe('DatadogRumProvider', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>

  beforeEach(() => {
    initReactOldBrowsersSupport()
    startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        nextjs: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })
  })

  it('renders children correctly', () => {
    replaceMockable(usePathname, () => '/')
    replaceMockable(useParams, () => ({}))

    const container = appendComponent(
      <DatadogRumProvider>
        <div data-testid="test-child">Test Content</div>
      </DatadogRumProvider>
    )

    const child = container.querySelector('[data-testid="test-child"]')
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('Test Content')
    expect(child!.parentElement).toBe(container)
  })

  it('starts initial view on mount', () => {
    replaceMockable(usePathname, () => '/home')
    replaceMockable(useParams, () => ({}))

    appendComponent(
      <DatadogRumProvider>
        <div>Content</div>
      </DatadogRumProvider>
    )

    expect(startViewSpy).toHaveBeenCalledWith('/home')
  })

  it('starts initial view with normalized name using params', () => {
    replaceMockable(usePathname, () => '/user/42')
    replaceMockable(useParams, () => ({ id: '42' }))

    appendComponent(
      <DatadogRumProvider>
        <div>Content</div>
      </DatadogRumProvider>
    )

    expect(startViewSpy).toHaveBeenCalledWith('/user/:id')
  })

  it('renders multiple children', () => {
    replaceMockable(usePathname, () => '/')
    replaceMockable(useParams, () => ({}))

    const container = appendComponent(
      <DatadogRumProvider>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
        <div data-testid="child-3">Child 3</div>
      </DatadogRumProvider>
    )

    expect(container.querySelector('[data-testid="child-1"]')!.textContent).toBe('Child 1')
    expect(container.querySelector('[data-testid="child-2"]')!.textContent).toBe('Child 2')
    expect(container.querySelector('[data-testid="child-3"]')!.textContent).toBe('Child 3')
  })
})
