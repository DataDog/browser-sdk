import { BuildEnv, Datacenter, Environment } from '@browser-sdk/core'

export const buildEnv: BuildEnv = {
  datacenter: '<<< TARGET_DATACENTER >>>' as Datacenter,
  env: '<<< TARGET_ENV >>>' as Environment,
  version: '<<< VERSION >>>',
}
