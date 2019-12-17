import { BuildEnv } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  datacenter: '<<< TARGET_DATACENTER >>>' as BuildEnv['datacenter'],
  env: '<<< TARGET_ENV >>>' as BuildEnv['env'],
  version: '<<< VERSION >>>',
}
