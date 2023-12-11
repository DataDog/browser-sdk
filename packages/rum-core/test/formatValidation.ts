import type { Context } from '@datadog/browser-core'
import ajv from 'ajv'
import { allJsonSchemas } from './allJsonSchemas'

export function validateRumFormat(rumEvent: Context) {
  const instance = new ajv({
    allErrors: true,
  })

  instance.addSchema(allJsonSchemas)

  void instance.validate('rum-events-schema.json', rumEvent)

  if (instance.errors) {
    const errors = instance.errors
      .map((error) => {
        let message = error.message
        if (error.keyword === 'const') {
          message += ` '${(error.params as { allowedValue: string }).allowedValue}'`
        }
        return `  ${error.dataPath || 'event'} ${message}`
      })
      .join('\n')
    fail(`Invalid RUM event format:\n${errors}`)
  }
}
