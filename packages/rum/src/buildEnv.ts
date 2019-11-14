import { BuildEnv } from '@browser-agent/core'

export const buildEnv: BuildEnv = {
  datacenter: '<<< TARGET_DC >>>' as BuildEnv['datacenter'],
  env: '<<< TARGET_ENV >>>' as BuildEnv['env'],
  version: '<<< VERSION >>>',
}
