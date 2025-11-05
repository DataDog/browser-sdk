import { definePublicApiGlobal } from '@datadog/browser-internal-next'
import * as main from './main'

export * from './main'

definePublicApiGlobal(main)
