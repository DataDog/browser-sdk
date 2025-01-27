import type { Reporter } from '@playwright/test/reporter'
import { APPLICATION_ID } from 'lib/helpers/configuration'
import { getRunId } from '../envUtils'

export default class NoticeReporter implements Reporter {
  onBegin() {
    console.log(
      `[RUM events] https://app.datadoghq.com/rum/explorer?query=${encodeURIComponent(
        `@application.id:${APPLICATION_ID} @context.run_id:"${getRunId()}"`
      )}`
    )
    console.log(`[Log events] https://app.datadoghq.com/logs?query=${encodeURIComponent(`@run_id:"${getRunId()}"`)}\n`)
  }
}
