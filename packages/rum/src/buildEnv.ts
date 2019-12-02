import { BuildEnv } from '@browser-sdk/core'

export const buildEnv: BuildEnv = {
  datacenter: '<<< TARGET_DATACENTER >>>' as BuildEnv['datacenter'],
  env: '<<< TARGET_ENV >>>' as BuildEnv['env'],
  version: '<<< VERSION >>>',
}
