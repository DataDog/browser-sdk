/**
 * From https://docs.datadoghq.com/real_user_monitoring/guide/setup-feature-flag-data-collection/?tab=browser#launchdarkly-integration:
 * ```js
 * const client = LDClient.initialize("<APP_KEY>", "<USER_ID>", {
 *   inspectors: [
 *     {
 *       type: "flag-used",
 *       name: "dd-inspector",
 *       method: (key: string, detail: LDClient.LDEvaluationDetail) => {
 *         datadogRum.addFeatureFlagEvaluation(key, detail.value);
 *       },
 *     },
 *   ],
 * });
 * ```
 *
 * Try to replicate the behaviour without addFeatureFlagEvaluation API
 */

import type { RumPlugin, RumEvent, RumGlobal } from '@datadog/browser-rum'
import LaunchDarkly from 'launchdarkly-js-client-sdk'
import type { LDEvaluationDetail, LDClient, LDUser, LDOptions } from 'launchdarkly-js-client-sdk'

export class LaunchDarklyPlugin implements RumPlugin {
  private readonly client: LDClient
  private datadogRum: RumGlobal | undefined
  private featureFlagEvaluationsByView: { [viewId: string]: { [key: string]: any } } = {}

  constructor(envKey: string, user: LDUser, options?: LDOptions | undefined) {
    const inspectors = options?.inspectors || []
    inspectors.push({
      type: 'flag-used',
      name: 'dd-inspector',
      method: this.trackEvaluation.bind(this),
    })
    this.client = LaunchDarkly.initialize(envKey, user, {
      ...options,
      inspectors,
    })
  }

  // TODO discuss expose RumGlobal VS RumPublicApi
  onRegistered(datadogRum: RumGlobal) {
    this.datadogRum = datadogRum
  }

  trackEvaluation(key: string, detail: LDEvaluationDetail) {
    const currentViewId = this.datadogRum?.getInternalContext()?.view?.id
    if (!currentViewId) {
      return
    }
    if (!this.featureFlagEvaluationsByView[currentViewId]) {
      this.featureFlagEvaluationsByView[currentViewId] = {}
    }
    this.featureFlagEvaluationsByView[currentViewId][key] = detail.value
  }

  beforeSend(event: RumEvent) {
    if (event.type === 'view') {
      const featureFlagEvaluations = this.featureFlagEvaluationsByView[event.view.id]

      // approach 1: in view event context
      // TODO require to remove restriction on update view context
      event.context = event.context || {} // TODO DX: update type to always have a context
      event.context.feature_flag_evaluations = featureFlagEvaluations

      // approach 2: with global context
      // cons:
      //   - first view update won't have the flags
      //   - no control on which event we get the flags
      if (event.view.id === this.datadogRum!.getInternalContext()?.view?.id) {
        // only on current view to avoid to put previous flags on global context for postponed view updates
        this.datadogRum!.setGlobalContextProperty('feature_flag_evaluations', featureFlagEvaluations)
      }

      // approach 3: in dedicated plugin context
      // TODO require to manage plugins context on event schema / backend / ui
      ;(event as RumEventWithLaunchDarklyPlugin).plugins.launch_darkly = {
        feature_flag_evaluations: featureFlagEvaluations,
      }
    }
  }

  getClient() {
    return this.client
  }
}

// cf approach 3
type RumEventWithPlugins = RumEvent & { plugins: { [plugin_name: string]: any } } // TODO move in rum package
type RumEventWithLaunchDarklyPlugin = RumEventWithPlugins & { plugins: { launch_darkly: LaunchDarklyPluginContext } }
interface LaunchDarklyPluginContext {
  feature_flag_evaluations: {
    [key: string]: LDEvaluationDetail['value']
  }
}
