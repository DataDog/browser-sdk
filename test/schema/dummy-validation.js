const Ajv = require('ajv')
const viewEvent = {
  type: 'view',
  date: 1591283924940,
  application: {
    id: 'ac8218cf-498b-4d33-bd44-151095959547',
  },
  session: {
    id: 'cacbf45c-3a05-48ce-b066-d76349460599',
    type: 'user',
  },
  view: {
    id: '623d50fd-75cf-4025-97d2-e51ff94171f6',
    referrer: '',
    url: 'https://app.datadoghq.com/rum/explorer?live=1h&query=&tab=view',
    loading_time: 4115295000,
    loading_type: 'initial_load',
    time_spent: 245512755000,
    first_contentful_paint: 420725000,
    dom_complete: 2144660000,
    dom_content_loaded: 951715000,
    dom_interactive: 906695000,
    load_event: 2154370000,
    action: {
      count: 0,
    },
    error: {
      count: 2,
    },
    long_task: {
      count: 5,
    },
    resource: {
      count: 9,
    },
  },
  _dd: {
    document_version: 9,
    format_version: 2,
  },
}

const ajv = new Ajv()
const valid = ajv
  // TODO improve me
  .addSchema(require('../../rum-events-format/schemas/_common-schema.json'), 'schemas/_common-schema.json')
  .addSchema(require('../../rum-events-format/schemas/view-schema.json'), 'schemas/view-schema.json')
  .addSchema(require('../../rum-events-format/schemas/action-schema.json'), 'schemas/action-schema.json')
  .addSchema(require('../../rum-events-format/schemas/resource-schema.json'), 'schemas/resource-schema.json')
  .addSchema(require('../../rum-events-format/schemas/long_task-schema.json'), 'schemas/long_task-schema.json')
  .addSchema(require('../../rum-events-format/schemas/error-schema.json'), 'schemas/error-schema.json')
  .addSchema(require('../../rum-events-format/rum-events-format.json'), 'rum-events-format.json')
  .validate('rum-events-format.json', viewEvent)

if (!valid) {
  console.error('❌')
  console.error(ajv.errorsText())
  process.exit(1)
}
console.log('✅')
