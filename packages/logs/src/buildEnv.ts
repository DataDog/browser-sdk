import { BuildEnv, Datacenter, Environment } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildEnv['buildMode'],
  datacenter: '<<< TARGET_DATACENTER >>>' as Datacenter,
  env: '<<< TARGET_ENV >>>' as Environment,
  sdkVersion: '<<< SDK_VERSION >>>',
}
