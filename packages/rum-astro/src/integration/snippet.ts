import type { DatadogRumOptions } from './types'

export function buildBrowserSnippet(options: DatadogRumOptions): string {
  return `import * as datadogRum from "@datadog/browser-rum-astro";

datadogRum.init({
  ${buildCommonInitOptions(options)}
});`
}

const buildCommonInitOptions = (options: DatadogRumOptions): string => `
  applicationId: ${options.applicationId ? JSON.stringify(options.applicationId) : "'env.DD_RUM_APPLICATION_ID'"},
  clientToken: ${options.clientToken ? JSON.stringify(options.clientToken) : "'env.DD_RUM_CLIENT_TOKEN'"},
  site: ${options.site ? JSON.stringify(options.site) : "'datadoghq.com'"},
  service: ${options.service ? JSON.stringify(options.service) : "''"},
  env: ${options.env ? JSON.stringify(options.env) : "''"},
  version: ${options.version ? JSON.stringify(options.version) : "''"},
  sessionSampleRate: ${options.sessionSampleRate ?? 100},
  sessionReplaySampleRate: ${options.sessionReplaySampleRate ?? 100},
  trackUserInteractions: ${options.trackUserInteractions ?? true},
  trackResources: ${options.trackResources ?? true},
  trackLongTasks: ${options.trackLongTasks ?? true},
  defaultPrivacyLevel: ${options.defaultPrivacyLevel ? JSON.stringify(options.defaultPrivacyLevel) : "''"},
  `
