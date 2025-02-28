import { useEffect, useState } from 'react'
import { runInWindow } from '../evalInWindow'

export type ApiDiagnosticLevel = 'info' | 'warning' | 'error'

export type ApiPathComponent =
  | {
      type: 'prototype'
      name: string
    }
  | {
      type: 'value'
      name: string
    }
  | {
      type: 'get'
      name: string
    }
  | {
      type: 'set'
      name: string
    }

export type ApiDiagnostic = {
  subject: ApiPathComponent[]
  level: ApiDiagnosticLevel
  message: string
}

export type ApiDiagnosticsResult =
  | {
      status: 'success'
      diagnostics: ApiDiagnostic[]
    }
  | {
      status: 'error'
      error: Error
    }

export function useApiDiagnostics() {
  const [result, setResult] = useState<ApiDiagnosticsResult | undefined>(undefined)

  useEffect(() => {
    getDiagnostics()
      .then((diagnostics) => setResult({ status: 'success', diagnostics }))
      .catch((error) => setResult({ status: 'error', error }))
  }, [])

  return result
}

type ApiDiagnosticReporter = (diagnostic: ApiDiagnostic) => void

type PropertyToCheck = {
  path: ApiPathComponent[]
  cleanValue: unknown
  usedValue: unknown
}

function getDiagnostics(): Promise<ApiDiagnostic[]> {
  return runInWindow((): Promise<ApiDiagnostic[]> => {
    const withCleanWindow = async <Result>(callback: (window: Window) => Result): Promise<Result> => {
      let container
      try {
        container = document.createElement('div')
        container.style.visibility = 'hidden'
        container.style.position = 'absolute'
        container.style.pointerEvents = 'none'
        const shadowRoot = container.attachShadow({ mode: 'closed' })

        const iframe = document.createElement('iframe')
        iframe.style.visibility = 'hidden'
        iframe.style.position = 'absolute'
        iframe.style.pointerEvents = 'none'

        const loaded = new Promise((resolve) => {
          iframe.addEventListener('load', resolve)
        })

        shadowRoot.appendChild(iframe)
        document.body.appendChild(container)
        await loaded

        if (!iframe.contentWindow) {
          throw new Error('Failed to load diagnostic iframe')
        }

        return callback(iframe.contentWindow)
      } finally {
        if (container) {
          document.body.removeChild(container)
        }
      }
    }

    const getPrototypeInfo = (object: object) => {
      const prototype = Object.getPrototypeOf(object)
      if (!prototype) {
        return undefined
      }

      let name = prototype[Symbol.toStringTag] ?? 'Object'
      if (name === 'Object') {
        name = prototype.constructor?.name ?? 'Object'
      }
      return { object: prototype, name }
    }

    const checkValue = (path: ApiPathComponent[], clean: any, used: any, report: ApiDiagnosticReporter) => {
      if (!Object.is(clean, used)) {
        report({
          subject: path,
          level: 'warning',
          message: `Value is ${used} (expected ${clean})`,
        })
      }
    }

    const checkFunction = (
      path: ApiPathComponent[],
      // eslint-disable-next-line @typescript-eslint/ban-types
      _clean: Function,
      // eslint-disable-next-line @typescript-eslint/ban-types
      used: Function,
      report: ApiDiagnosticReporter
    ) => {
      if (!used.toString().includes('[native code]')) {
        report({
          subject: path,
          level: 'warning',
          message: 'Native function has been overridden',
        })
      }
    }

    const checkNullObject = (
      path: ApiPathComponent[],
      clean: object | null,
      used: object | null,
      report: ApiDiagnosticReporter
    ) => {
      if (clean === null && used === null) {
        return
      }
      if (clean !== null && used !== null) {
        return
      }
      const cleanValue = clean === null ? 'null' : 'non-null'
      const usedValue = used === null ? 'null' : 'non-null'
      report({
        subject: path,
        level: 'warning',
        message: `Value is ${usedValue} (expected ${cleanValue})`,
      })
    }

    const collectPropertiesToCheck = (
      path: ApiPathComponent[],
      clean: object,
      used: object,
      visited: Set<object>
    ): PropertyToCheck[] => {
      // Do not visit objects we've already visited.
      if (visited.has(clean)) {
        return []
      }
      visited.add(clean)

      const propertiesToCheck: PropertyToCheck[] = []

      const prototype = getPrototypeInfo(clean)
      if (prototype) {
        propertiesToCheck.push({
          path: [...path, { type: 'prototype', name: prototype.name }],
          cleanValue: prototype.object,
          usedValue: Object.getPrototypeOf(used),
        })
      }

      const descriptors = Object.getOwnPropertyDescriptors(clean)
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (Object.hasOwn(descriptor, 'value')) {
          propertiesToCheck.push({
            path: [...path, { type: 'value', name }],
            cleanValue: descriptor.value,
            usedValue: Object.getOwnPropertyDescriptor(used, name)?.value,
          })
        }
        if (Object.hasOwn(descriptor, 'get')) {
          propertiesToCheck.push({
            path: [...path, { type: 'get', name }],
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cleanValue: descriptor.get,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            usedValue: Object.getOwnPropertyDescriptor(used, name)?.get,
          })
        }
        if (Object.hasOwn(descriptor, 'set')) {
          propertiesToCheck.push({
            path: [...path, { type: 'set', name }],
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cleanValue: descriptor.set,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            usedValue: Object.getOwnPropertyDescriptor(used, name)?.set,
          })
        }
      }

      return propertiesToCheck
    }

    const checkProperty = (
      property: PropertyToCheck,
      visited: Set<object>,
      report: ApiDiagnosticReporter
    ): PropertyToCheck[] => {
      const { path, cleanValue, usedValue } = property

      if (typeof cleanValue !== typeof usedValue) {
        report({
          subject: path,
          level: 'warning',
          message: `Value is a ${typeof usedValue} (expected a ${typeof cleanValue})`,
        })
        return []
      }

      switch (typeof cleanValue) {
        case 'undefined':
        case 'boolean':
        case 'number':
        case 'bigint':
        case 'string':
        case 'symbol':
          checkValue(path, cleanValue, usedValue, report)
          return []

        case 'object':
          if (cleanValue === null || usedValue === null) {
            checkNullObject(path, cleanValue, usedValue as object | null, report)
            return []
          }
          return collectPropertiesToCheck(path, cleanValue, usedValue as object, visited)

        case 'function':
          // eslint-disable-next-line @typescript-eslint/ban-types
          checkFunction(path, cleanValue, usedValue as Function, report)
          return []

        default:
          throw new Error(`Unexpected property type: ${typeof cleanValue}`)
      }
    }

    return withCleanWindow((clean) => {
      const visited = new Set<object>()

      const diagnostics: ApiDiagnostic[] = []
      const reporter: ApiDiagnosticReporter = (diagnostic) => {
        diagnostics.push(diagnostic)
      }

      // Visit all properties on the clean window object, and their properties
      // recursively, reporting any unexpected differences or overridden
      // functions detected on the corresponding property on the window object
      // actually used by the web page.
      //
      // We visit properties in BFS order to ensure that we generate names
      // with as few path components as possible when an object is reachable
      // via multiple paths. (Not uncommon for prototypes!)
      const properties = collectPropertiesToCheck([{ type: 'value', name: 'window' }], clean, window, visited)
      while (properties.length) {
        const property = properties.shift()!
        properties.push(...checkProperty(property, visited, reporter))
      }

      return diagnostics
    })
  })
}
