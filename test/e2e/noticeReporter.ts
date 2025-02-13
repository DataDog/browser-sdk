import type { Reporter } from '@playwright/test/reporter'
import { getRumUrl } from './lib/helpers/playwright'

// eslint-disable-next-line import/no-default-export
export default class NoticeReporter implements Reporter {
  onBegin() {
    const { rum, logs } = getRumUrl()
    console.log(`[RUM events] ${rum}`)
    console.log(`[Log events] ${logs}`)
  }
}
