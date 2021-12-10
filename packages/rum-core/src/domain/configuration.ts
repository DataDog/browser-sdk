import { DefaultPrivacyLevel, InitConfiguration } from '@datadog/browser-core'
import { RumEventDomainContext } from '../domainContext.types'
import { RumEvent } from '../rumEvent.types'

export interface RumInitConfiguration extends InitConfiguration {
  applicationId: string
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => void | boolean) | undefined
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
}

export type HybridInitConfiguration = Omit<RumInitConfiguration, 'applicationId' | 'clientToken'>
