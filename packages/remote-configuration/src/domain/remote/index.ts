import type { InitConfiguration } from '@datadog/browser-core'

import type { FetchOptions } from './fetch'
import { fetch } from './fetch'
import { process } from './process'

type Options = FetchOptions
async function remoteConfiguration(options: Options): Promise<InitConfiguration> {
  const remote = await fetch(options)

  return process(remote)
}

export { remoteConfiguration }
export type { Options as RemoteConfigurationOptions }
