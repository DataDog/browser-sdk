import { remoteConfiguration } from '@datadog/browser-remote-configuration'
import type { InitConfiguration } from '@datadog/browser-core'

import { buildCdnUrl } from './cdnUrlBuilder.ts'
import { fetchCdnBundle } from './remoteConfigFetcher.ts'

function generateInitCode(config: InitConfiguration): string {
  // Serialize config to JavaScript, properly escaping values
  const configJson = JSON.stringify({ ...config, clientToken: 'xxx', user: undefined, context: undefined }, null, 2)

  return `
(function() {
  if (typeof DD_RUM === 'undefined') {
    console.error('[SSI] DD_RUM is not defined. Make sure the RUM SDK loaded correctly.');
    return;
  }

  try {
    DD_RUM._setDebug(true)
    DD_RUM.init(${configJson});
  } catch (error) {
    console.error('[SSI] Failed to initialize DD_RUM:', error);
  }
})();
`
}

export async function generateResponse(configId: string): Promise<string> {
  // 1. Fetch remote config to get site and full configuration
  const remoteConfig = await remoteConfiguration({ id: configId })
  const site = remoteConfig.site || 'datadoghq.com'

  // 2. Fetch RUM SDK bundle from CDN
  const rumSdk = await fetchCdnBundle(buildCdnUrl(site, 'v6'))

  // 3. Generate initialization code with embedded config
  const initCode = generateInitCode(remoteConfig)

  // 4. Concatenate SDK and init call
  return [`import '${buildCdnUrl(site, 'v6')}';`, initCode].join('\n\n')
}
