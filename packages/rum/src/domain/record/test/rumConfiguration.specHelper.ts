import { NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration
