export const Datacenter = {
  EU: 'eu',
  US: 'us',
} as const

export type Datacenter = typeof Datacenter[keyof typeof Datacenter]

export interface UserConfiguration {
  publicApiKey?: string // deprecated
  clientToken: string
  applicationId?: string
  internalMonitoringApiKey?: string
  allowedTracingOrigins?: Array<string | RegExp>
  sampleRate?: number
  resourceSampleRate?: number
  datacenter?: Datacenter // deprecated
  site?: string
  enableExperimentalFeatures?: string[]
  silentMultipleInit?: boolean
  trackInteractions?: boolean
  proxyHost?: string
  beforeSend?: (event: any) => void

  service?: string
  env?: string
  version?: string

  useAlternateIntakeDomains?: boolean
  useCrossSiteSessionCookie?: boolean
  useSecureSessionCookie?: boolean
  trackSessionAcrossSubdomains?: boolean

  // only on staging build mode
  replica?: ReplicaUserConfiguration
}

interface ReplicaUserConfiguration {
  applicationId?: string
  clientToken: string
}
