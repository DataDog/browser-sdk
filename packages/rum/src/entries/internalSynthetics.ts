/**
 * Entry point consumed by the Datadog Synthetics worker to automatically inject a RUM SDK instance
 * in test runs.
 *
 * WARNING: this module is not intended for public usages, and won't follow semver for breaking
 * changes.
 */
import { makeRumPublicApi, startRum } from '@flashcatcloud/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { lazyLoadRecorder } from '../boot/lazyLoadRecorder'

export { DefaultPrivacyLevel } from '@flashcatcloud/browser-core'

// Disable the rule that forbids potential side effects, because we know that those functions don't
// have side effects.
/* eslint-disable local-rules/disallow-side-effects */
const recorderApi = makeRecorderApi(lazyLoadRecorder)
export const datadogRum = makeRumPublicApi(startRum, recorderApi, { ignoreInitIfSyntheticsWillInjectRum: false })
/* eslint-enable local-rules/disallow-side-effects */
