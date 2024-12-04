import { Badge, Button, Flex, Text } from '@mantine/core'
import React, { useCallback, useEffect, useState } from 'react'
import { Alert } from '../alert'
import { runInWindow } from '../../evalInWindow'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import { createLogger } from '../../../common/logger'

const logger = createLogger('diagnosticsTab')

type DiagnosticLevel = 'info' | 'warning' | 'error'
type Diagnostic = {
  subject: string
  level: DiagnosticLevel
  message: string
}

const DIAGNOSTIC_LEVEL_COLOR: { [level in DiagnosticLevel]: string } = {
  error: 'red',
  info: 'teal',
  warning: 'orange',
}

export function DiagnosticsTab() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [diagnosticError, setDiagnosticError] = useState<Error | undefined>(undefined)
  
  const refresh = useCallback(() => {
    getDiagnostics().then(setDiagnostics).catch(setDiagnosticError)
  }, [setDiagnostics, setDiagnosticError])

  useEffect(refresh, [])

  if (diagnosticError) {
    return <Alert level="error" message="Failed to fetch diagnostics." />
  }

  return (
    <TabBase>
      <Columns>
        <Columns.Column title="Diagnostics">
          <Button color="violet" variant="light" onClick={refresh}>
           Refresh
          </Button>
          
          <Flex direction='column'>
          {diagnostics.map(diagnostic => (
            <Flex direction='row' style={{columnGap: '5px'}}>
              <Badge
               variant="outline"
               color={DIAGNOSTIC_LEVEL_COLOR[diagnostic.level]}
               style={{
                 alignSelf: 'center',
                 minWidth: '10em',
               }}
              >
                {diagnostic.level}
              </Badge>
              <Flex direction='column'>
               <Text style={{fontWeight: 'bold'}}>{diagnostic.subject}</Text>
               <Text>{diagnostic.message}</Text>
              </Flex>
            </Flex>
          ))}
          </Flex>
        </Columns.Column>
      </Columns>
    </TabBase>
  )
}

type DiagnosticReporter = (diagnostic: Diagnostic) => void

type PropertyToCheck = {
  path: string,
  cleanValue: unknown,
  usedValue: unknown,
}

async function getDiagnostics(): Promise<Diagnostic[]> {
  try {
    return await runInWindow((): Promise<Diagnostic[]> => {
      const withCleanWindow = async <Result,>(
        callback: (window: Window
      ) => Result): Promise<Result> => {
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

          const loaded = new Promise(resolve => {
            iframe.addEventListener('load', resolve)
          })

          shadowRoot.appendChild(iframe)
          document.body.appendChild(container)
          await loaded;
          
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

      const checkValue = (
        path: string,
        clean: any,
        used: any,
        report: DiagnosticReporter,
      ) => {
        if (!Object.is(clean, used)) {
          report({
            subject: path,
            level: 'warning',
            message: `Value is ${used} (expected ${clean})`,
          })
        }
      }

      const checkFunction = (
        path: string,
        // eslint-disable-next-line @typescript-eslint/ban-types
        _clean: Function,
        // eslint-disable-next-line @typescript-eslint/ban-types
        used: Function,
        report: DiagnosticReporter,
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
        path: string,
        clean: object | null,
        used: object | null,
        report: DiagnosticReporter,
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
        path: string,
        clean: object,
        used: object,
        visited: Set<object>,
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
            path: `${path}.prototype(${prototype.name})`,
            cleanValue: prototype.object,
            usedValue: Object.getPrototypeOf(used),
          })
        }

        const descriptors = Object.getOwnPropertyDescriptors(clean)
        for (const [name, descriptor] of Object.entries(descriptors)) {
          if (Object.hasOwn(descriptor, 'value')) {
            propertiesToCheck.push({
              path: `${path}.${name}`,
              cleanValue: descriptor.value,
              usedValue: Object.getOwnPropertyDescriptor(used, name)?.value,
            })
          }
          if (Object.hasOwn(descriptor, 'get')) {
            propertiesToCheck.push({
              path: `${path}.get(${name})`,
              // eslint-disable-next-line @typescript-eslint/unbound-method
              cleanValue: descriptor.get,
              // eslint-disable-next-line @typescript-eslint/unbound-method
              usedValue: Object.getOwnPropertyDescriptor(used, name)?.get,
            })
          }
          if (Object.hasOwn(descriptor, 'set')) {
            propertiesToCheck.push({
              path: `${path}.set(${name})`,
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
        report: DiagnosticReporter,
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
            checkValue(path, cleanValue, usedValue, report);
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

        const diagnostics: Diagnostic[] = []
        const reporter: DiagnosticReporter = (diagnostic) => {
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
        const properties = collectPropertiesToCheck('window', clean, window, visited)
        while (properties.length) {
          const property = properties.shift()!
          properties.push(...checkProperty(property, visited, reporter))
        }
        
        return diagnostics
      })
    })
  } catch(error) {
   logger.error('Error while refreshing diagnostics:', error)
   return []
  }
}