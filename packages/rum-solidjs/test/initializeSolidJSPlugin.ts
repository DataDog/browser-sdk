import type { RumInitConfiguration, RumPublicApi } from "@datadog/browser-rum-core"
import { noop } from "@datadog/browser-core"
import type { SolidJSPluginConfiguration } from "../src/domain/solidjsPlugin"
import { solidjsPlugin, resetSolidJSPlugin } from "../src/domain/solidjsPlugin"
import { registerCleanupTask } from "../../core/test"

export function initializeSolidJSPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: SolidJSPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: any
} = {}) {
  resetSolidJSPlugin()
  const plugin = solidjsPlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetSolidJSPlugin())
}
