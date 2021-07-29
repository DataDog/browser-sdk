import { BuildEnv, BuildMode } from '@datadog/browser-core'

export const buildEnv: BuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildMode,
  sdkVersion: '<<< SDK_VERSION >>>',
}
