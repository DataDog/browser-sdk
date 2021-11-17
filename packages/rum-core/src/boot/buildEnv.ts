import { BuildEnv, BuildMode } from '@datadog/browser-core'

interface RumBuildEnv extends BuildEnv {
  syntheticsBundle: boolean
}

export const buildEnv: RumBuildEnv = {
  buildMode: '<<< BUILD_MODE >>>' as BuildMode,
  sdkVersion: '<<< SDK_VERSION >>>',
  syntheticsBundle: ('<<< SYNTHETICS_BUNDLE >>>' as string) === 'true',
}
