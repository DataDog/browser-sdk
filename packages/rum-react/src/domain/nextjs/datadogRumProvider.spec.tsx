import React from 'react'
import { registerCleanupTask } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { DatadogRumProvider } from './datadogRumProvider'

describe('DatadogRumProvider', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>
  let originalPushState: History['pushState']
  let originalReplaceState: History['replaceState']

  beforeEach(() => {
    startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        nextjs: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })

    originalPushState = history.pushState.bind(history)
    originalReplaceState = history.replaceState.bind(history)

    registerCleanupTask(() => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    })
  })

  it('renders children correctly', () => {
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
    appendComponent(
      <DatadogRumProvider>
        <div>Content</div>
      </DatadogRumProvider>
    )

    expect(startViewSpy).toHaveBeenCalledWith(window.location.pathname)
  })

  it('starts a new view on navigation', () => {
    appendComponent(
      <DatadogRumProvider>
        <div>Content</div>
      </DatadogRumProvider>
    )

    startViewSpy.calls.reset()
    history.pushState({}, '', '/new-page')

    expect(startViewSpy).toHaveBeenCalledWith('/new-page')
  })

  it('renders multiple children', () => {
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
