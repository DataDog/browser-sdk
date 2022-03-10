// eslint-disable-next-line local-rules/disallow-side-effects
import { net } from 'electron'
import type { EndpointBuilder } from '@datadog/browser-core'
import { display } from '@datadog/browser-core'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpRequest {
  constructor(private endpointBuilder: EndpointBuilder) {}

  send(data: string, reason?: string) {
    display.log('flushing data for ', reason)
    const url = this.endpointBuilder.build()
    const request = net.request({
      method: 'POST',
      url,
    })
    request.setHeader('content-type', 'text/plain')
    request.on('response', (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return
      }
      display.error(`fail to flush with status: ${res.statusCode}`)
    })
    request.on('error', (err) => {
      display.error('fail to flush', err)
    })
    request.write(data)
    request.end()
  }
}
