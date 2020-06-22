import { BuildEnv, BuildMode, Datacenter, SdkEnv } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildMode,
  datacenter: '<<< TARGET_DATACENTER >>>' as Datacenter,
  sdkEnv: '<<< TARGET_ENV >>>' as SdkEnv,
  sdkVersion: '<<< SDK_VERSION >>>',
}
