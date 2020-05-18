import { BuildEnv } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildEnv['buildMode'],
  datacenter: '<<< TARGET_DATACENTER >>>' as BuildEnv['datacenter'],
  sdkEnv: '<<< TARGET_ENV >>>' as BuildEnv['sdkEnv'],
  sdkVersion: '<<< SDK_VERSION >>>',
}
