import { flushEvents, createTest, html } from '../lib/framework'

const HANDLING_STACK_REGEX = /^Error: \n\s+at testHandlingStack @/

const RUM_CONFIG = {
  enableExperimentalFeatures: ['micro_frontend'],
  beforeSend: (event: any, domainContext: any) => {
    if ('handlingStack' in domainContext) {
      event.context!.handlingStack = domainContext.handlingStack
    }

    return true
  },
}

function createBody(additionalBody: string = '') {
  return (
    html`
      <script>
        function done() {
          const done = document.createElement('div')
          done.id = 'done'
          document.body.appendChild(done)
        }
      </script>
    ` + additionalBody
  )
}

describe('microfrontend', () => {
  createTest('expose handling stack for fetch requests')
    .withRum(RUM_CONFIG)
    .withBody(
      createBody(
        html`<script>
          async function testHandlingStack() {
            await fetch('/ok')
            done()
          }

          testHandlingStack()
        </script>`
      )
    )
    .run(async ({ intakeRegistry }) => {
      await $('#done')
      await flushEvents()

      const event = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')

      expect(event).toBeTruthy()
      expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
    })

  createTest('expose handling stack for xhr requests')
    .withRum(RUM_CONFIG)
    .withBody(
      createBody(
        html`<script>
          function testHandlingStack() {
            const xhr = new XMLHttpRequest()
            xhr.addEventListener('loadend', done)
            xhr.open('GET', '/ok')
            xhr.send()
          }

          testHandlingStack()
        </script>`
      )
    )
    .run(async ({ intakeRegistry }) => {
      await $('#done')
      await flushEvents()

      const event = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'xhr')

      expect(event).toBeTruthy()
      expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
    })

  createTest('expose handling stack for DD_RUM.addAction')
    .withRum(RUM_CONFIG)
    .withBody(
      createBody(
        html`<script>
          function testHandlingStack() {
            DD_RUM.addAction('foo')
            done()
          }

          testHandlingStack()
        </script>`
      )
    )
    .run(async ({ intakeRegistry }) => {
      await $('#done')
      await flushEvents()

      const event = intakeRegistry.rumActionEvents[0]

      expect(event).toBeTruthy()
      expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
    })

  createTest('expose handling stack for DD_RUM.addError')
    .withRum(RUM_CONFIG)
    .withBody(
      createBody(
        html`<script>
          function testHandlingStack() {
            DD_RUM.addError(new Error('foo'))
            done()
          }

          testHandlingStack()
        </script>`
      )
    )
    .run(async ({ intakeRegistry }) => {
      await $('#done')
      await flushEvents()

      const event = intakeRegistry.rumErrorEvents[0]

      expect(event).toBeTruthy()
      expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
    })
})
