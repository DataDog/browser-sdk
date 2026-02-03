import React from 'react'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { DatadogRumProvider } from './datadogRumProvider'

describe('DatadogRumProvider', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>
  let usePathnameSpy: jasmine.Spy<() => string>

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

    usePathnameSpy = jasmine.createSpy('usePathname').and.returnValue('/')
  })

  it('renders children correctly', () => {
    const container = appendComponent(
      <DatadogRumProvider usePathname={usePathnameSpy}>
        <div data-testid="test-child">Test Content</div>
      </DatadogRumProvider>
    )

    const child = container.querySelector('[data-testid="test-child"]')
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('Test Content')
    expect(child!.parentElement).toBe(container)
  })

  it('calls usePathnameTracker', () => {
    usePathnameSpy.and.returnValue('/product/123')

    appendComponent(
      <DatadogRumProvider usePathname={usePathnameSpy}>
        <div>Content</div>
      </DatadogRumProvider>
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/product/:id')
  })

  it('renders multiple children', () => {
    const container = appendComponent(
      <DatadogRumProvider usePathname={usePathnameSpy}>
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
