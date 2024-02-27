import type { RumInitConfiguration } from '@datadog/browser-rum'

type SdkConfig = {
  clientConfigPath?: string
  debug?: boolean
}

type SdkEnabledOptions = {
  enabled?: boolean
}

export type DatadogRumOptions = Partial<RumInitConfiguration> & SdkEnabledOptions & SdkConfig
