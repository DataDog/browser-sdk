import type { EndpointBuilder, InitConfiguration } from '@datadog/browser-core'
import { computeTransportConfiguration } from '../../../../../../packages/core/src/domain/configuration'
import { copy } from '../../../copy'
import type { SdkInfos } from '../../../hooks/useSdkInfos'
import type { SdkEvent } from '../../../sdkEvent'
import { getEventSource, EventSource } from '../../../sdkEvent'

export function canCopyEvent(sdkInfos: SdkInfos | undefined, event: SdkEvent): sdkInfos is SdkInfos {
  return Boolean(sdkInfos && getIntakeUrlForEvent(sdkInfos, event))
}

/**
 * Copy the event as a curl command to the clipboard.
 *
 * This function is "naive" in the sense that it does not reflect the actual request done by the
 * SDK:
 *
 * * Request payloads are sometimes compressed, and we don't compress them here.
 *
 * * The intake URL is computed using the a version of the SDK that might not match one used by the
 * website.
 *
 * * Various tags like "api", "flush_reason", "retry_count" and "retry_after" are not included or
 * hardcoded.
 *
 * * Various browser headers like "User-Agent" are not included.
 */
export function copyEventAsCurl(sdkInfos: SdkInfos, event: SdkEvent) {
  const url = getIntakeUrlForEvent(sdkInfos, event)
  copy(`curl '${url}' \\
  -X POST \\
  -H 'Content-Type: text/plain' \\
  --data-raw ${escapeShellParameter(JSON.stringify(event))}`)
}

/**
 * Copy the event as a fetch API call to the clipboard.
 *
 * This function is "naive" in the sense that it does not reflect the actual request done by the
 * SDK:
 *
 * * Request payloads are sometimes compressed, and we don't compress them here.
 *
 * * The intake URL is computed using the a version of the SDK that might not match one used by the
 * website.
 *
 * * Various tags like "api", "flush_reason", "retry_count" and "retry_after" are not included or
 * hardcoded.
 *
 * * Various browser headers like "User-Agent" are not included.
 */
export function copyEventAsFetch(sdkInfos: SdkInfos, event: SdkEvent) {
  const url = getIntakeUrlForEvent(sdkInfos, event)
  copy(`fetch('${url}', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify(${JSON.stringify(event, null, 2)})
  })`)
}

export function escapeShellParameter(value: string) {
  return `$'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function getIntakeUrlForEvent(sdkInfos: SdkInfos, event: SdkEvent) {
  let builder: EndpointBuilder
  let version: string

  switch (getEventSource(event)) {
    case EventSource.RUM:
    case EventSource.METRIC:
    case EventSource.TELEMETRY: {
      if (!sdkInfos.rum?.config || !sdkInfos.rum?.version) {
        return
      }
      version = sdkInfos.rum.version
      builder = computeTransportConfiguration(sdkInfos.rum.config as InitConfiguration).rumEndpointBuilder
      break
    }

    case EventSource.LOGS:
      if (!sdkInfos.logs?.config || !sdkInfos.logs?.version) {
        return
      }
      version = sdkInfos.logs.version
      builder = computeTransportConfiguration(sdkInfos.logs.config as InitConfiguration).logsEndpointBuilder
      break
  }

  return builder
    .build('manual', { data: 'a', bytesCount: 1 })
    .replace(/sdk_version%3A[^%&]+/g, `sdk_version%3A${encodeURIComponent(version)}`)
    .replace(/dd-evp-origin-version=[^&]+/g, `dd-evp-origin-version=${encodeURIComponent(version)}`)
}
