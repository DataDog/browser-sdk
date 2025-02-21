import fs from 'fs'
import type { RumEvent } from '@datadog/browser-rum'
import ajv from 'ajv'
import { globSync } from 'glob'
import { expect } from '@playwright/test'

export function validateRumFormat(events: RumEvent[]) {
  const instance = new ajv({
    allErrors: true,
  })
  const allJsonSchemas = globSync('./rum-events-format/schemas/**/*.json').map(
    (path) => JSON.parse(fs.readFileSync(path, 'utf8')) as object
  )
  instance.addSchema(allJsonSchemas)

  events.forEach((rumEvent) => {
    void instance.validate('rum-events-schema.json', rumEvent)
    expect(instance.errors).toBe(null)
  })
}
