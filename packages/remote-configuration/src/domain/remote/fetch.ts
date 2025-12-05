import { display } from '@datadog/browser-core'
import type { Site } from '@datadog/browser-core'

import type { RemoteConfiguration } from './process'

interface Options {
  id: string
  proxy?: string
  site?: Site
  version?: string
}

function buildEndpoint(options: Options) {
  if (options.proxy) {
    return options.proxy
  }

  const { id, site = 'datadoghq.com', version = 'v1' } = options

  const lastBit = site.lastIndexOf('.')
  const domain = site.slice(0, lastBit).replace(/[.]/g, '-') + site.slice(lastBit)

  return `https://sdk-configuration.browser-intake-${domain}/${version}/${encodeURIComponent(id)}.json`
}

async function fetch(options: Options): Promise<RemoteConfiguration> {
  const endpoint = buildEndpoint(options)

  try {
    const response = await globalThis.fetch(endpoint)

    if (!response.ok) {
      throw new Error(`Status code ${response.statusText}`)
    }

    // workaround for rum
    const remote = (await response.json()) as { rum: RemoteConfiguration }

    return remote.rum
  } catch (e) {
    const message = `Error fetching remote configuration from ${endpoint}: ${e as Error}`

    display.error(message)
    throw new Error(message)
  }
}

export { fetch }
export type { Options as FetchOptions }
