import { definePublicApiGlobal } from '@datadog/browser-internal-next'
import * as main from './main'

definePublicApiGlobal(main, 'logs')
