import type { Context } from '@datadog/browser-core'
import ajv from 'ajv'
import rumEventsSchemaJson from '../../../rum-events-format/schemas/rum-events-schema.json'
import _commonSchemaJson from '../../../rum-events-format/schemas/rum/_common-schema.json'
import _actionChildSchemaJson from '../../../rum-events-format/schemas/rum/_action-child-schema.json'
import _perfMetricSchemaJson from '../../../rum-events-format/schemas/rum/_perf-metric-schema.json'
import actionSchemaJson from '../../../rum-events-format/schemas/rum/action-schema.json'
import errorSchemaJson from '../../../rum-events-format/schemas/rum/error-schema.json'
import longTaskSchemaJson from '../../../rum-events-format/schemas/rum/long_task-schema.json'
import resourceSchemaJson from '../../../rum-events-format/schemas/rum/resource-schema.json'
import viewSchemaJson from '../../../rum-events-format/schemas/rum/view-schema.json'

export function validateRumFormat(rumEvent: Context) {
  const instance = new ajv({
    allErrors: true,
  })
  void instance
    .addSchema(_commonSchemaJson, 'rum/_common-schema.json')
    .addSchema(_actionChildSchemaJson, 'rum/_action-child-schema.json')
    .addSchema(_perfMetricSchemaJson, 'rum/_perf-metric-schema.json')
    .addSchema(viewSchemaJson, 'rum/view-schema.json')
    .addSchema(actionSchemaJson, 'rum/action-schema.json')
    .addSchema(resourceSchemaJson, 'rum/resource-schema.json')
    .addSchema(longTaskSchemaJson, 'rum/long_task-schema.json')
    .addSchema(errorSchemaJson, 'rum/error-schema.json')
    .addSchema(rumEventsSchemaJson, 'rum-events-schema.json')
    .validate('rum-events-schema.json', rumEvent)

  if (instance.errors) {
    instance.errors.map((error) => fail(`${error.dataPath || 'event'} ${error.message!}`))
  }
}
