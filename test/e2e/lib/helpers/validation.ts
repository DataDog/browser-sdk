import fs from 'fs'
import * as path from 'node:path'
import type { RumEvent } from '@openobserve/browser-rum'
import ajv from 'ajv'

const schemasDir = path.join(path.dirname(require.resolve('@datadog/rum-events-format/package.json')), 'schemas')

export function validateRumFormat(events: RumEvent[]) {
  const instance = new ajv({
    allErrors: true,
  })
  const allJsonSchemas = fs
    .globSync(path.join(schemasDir, '**/*.json'))
    .map((path) => JSON.parse(fs.readFileSync(path, 'utf8')) as object)
  instance.addSchema(allJsonSchemas)

  events.forEach((rumEvent) => {
    void instance.validate('rum-events-schema.json', rumEvent)

    if (instance.errors) {
      const formattedError = instance.errors.map((error) => {
        let allowedValues: string[] | string | undefined
        switch (error.keyword) {
          case 'enum':
            allowedValues = error.params?.allowedValues as string[]
            break
          case 'const':
            allowedValues = error.params?.allowedValue as string
            break
        }

        return `event/${error.instancePath || ''} ${error.message!} ${allowedValues ? formatAllowedValues(allowedValues) : ''}`
      })

      throw new InvalidRumEventError(formattedError.join('\n'))
    }
  })
}

class InvalidRumEventError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRumEventError'
  }
}

function formatAllowedValues(allowedValues: string[] | string) {
  if (!Array.isArray(allowedValues)) {
    return `'${allowedValues}'`
  }

  return `('${allowedValues.join("', '")}')`
}
