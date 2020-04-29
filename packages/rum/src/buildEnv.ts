import { BuildEnv } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildEnv['buildMode'],
  datacenter: '<<< TARGET_DATACENTER >>>' as BuildEnv['datacenter'],
  env: '<<< TARGET_ENV >>>' as BuildEnv['env'],
  sdkVersion: '<<< SDK_VERSION >>>',
}
