/* eslint-disable local-rules/disallow-side-effects */
import { createDisplay, DOCS_ORIGIN, MORE_DETAILS } from '@datadog/js-core/util'

export const display = createDisplay('Datadog Browser SDK:')

export { DOCS_ORIGIN, MORE_DETAILS }
export const DOCS_TROUBLESHOOTING = `${DOCS_ORIGIN}/real_user_monitoring/browser/troubleshooting`
