import fs from 'fs'
import type { RumEvent } from '@datadog/browser-rum'
import ajv from 'ajv'

export function validateRumFormat(events: RumEvent[]) {
  const instance = new ajv({
    allErrors: true,
  })
  const allJsonSchemas = fs
    .globSync('./rum-events-format/schemas/**/*.json')
    .map((path) => JSON.parse(fs.readFileSync(path, 'utf8')) as object)
  instance.addSchema(allJsonSchemas)

  events.forEach((rumEvent) => {
    // Skip validation for view_update events until rum-events-format adds the schema.
    // When the schema PR lands, 'view_update' will be a valid type and this @ts-expect-error
    // will cause a typecheck failure — remove this skip and enable validation.
    // @ts-expect-error view_update is not in the RumEvent type yet
    if (rumEvent.type === 'view_update') {
      return
    }

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
