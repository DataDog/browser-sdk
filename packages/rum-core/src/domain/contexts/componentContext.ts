import type { Observable, RawError } from '@datadog/browser-core'
import {
  assign,
  clocksNow,
  computeRawError,
  computeStackTrace,
  ErrorHandling,
  ErrorSource,
  generateUUID,
  shallowClone,
} from '@datadog/browser-core'
import type React from 'react'
// eslint-disable-next-line local-rules/disallow-side-effects
import 'zone.js'

let errorObservable: Observable<RawError>
export function trackComponentError(newErrorObservable: Observable<RawError>) {
  errorObservable = newErrorObservable
}

export function addComponent(component: () => any) {
  return Zone.current
    .fork({
      name: component.name,
      properties: { _dd: true },
      onHandleError: (_parentZoneDelegate, _currentZone, _targetZone, error) => {
        if (errorObservable)
          errorObservable.notify(
            computeRawError({
              stackTrace: computeStackTrace(error as Error),
              originalError: error,
              startClocks: clocksNow(),
              nonErrorPrefix: 'Uncaught',
              source: ErrorSource.SOURCE,
              handling: ErrorHandling.UNHANDLED,
            })
          )
        return false
      },
    })
    .wrap(component, generateUUID())
}

export function getComponent(): string | undefined {
  return Zone.current.get('_dd') ? Zone.current.name : undefined
}

export function patchReact(react: typeof React) {
  const originalUseEffect = react.useEffect
  react.useEffect = (effect, deps) => originalUseEffect(Zone.current.wrap(effect, ''), deps)

  const originalCreateElement = react.createElement

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  react.createElement = (type, props?, ...children) => {
    if (props) {
      for (const key of Object.keys(props)) {
        if (typeof props[key] === 'function') props[key] = Zone.current.wrap(props[key], '')
      }
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const isReactComponent = typeof child.type === 'function'
      if (isReactComponent) children[i] = assign(shallowClone(child), { type: Zone.current.wrap(child.type, '') })
    }

    return originalCreateElement(type, props, ...children)
  }
}
