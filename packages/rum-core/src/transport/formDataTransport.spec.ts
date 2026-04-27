import { createIdentityEncoder, DeflateEncoderStreamId as CoreDeflateEncoderStreamId } from '@datadog/browser-core'
import { interceptRequests, readFormDataRequest } from '@datadog/browser-core/test'
import { LifeCycle } from '../domain/lifeCycle'
import { mockRumConfiguration } from '../../test'
import { createFormDataTransport } from './formDataTransport'

describe('createFormDataTransport', () => {
  function setup() {
    const interceptor = interceptRequests()
    const lifeCycle = new LifeCycle()
    const transport = createFormDataTransport(
      mockRumConfiguration(),
      lifeCycle,
      createIdentityEncoder,
      CoreDeflateEncoderStreamId.REPLAY
    )

    return { interceptor, transport, lifeCycle }
  }

  it('should send event and attachments as FormData', async () => {
    const { interceptor, transport } = setup()

    const payload = {
      event: { type: 'test-event', data: 'test-data' },
      'attachment.json': { foo: 'bar' },
    }

    await transport.send(payload)

    expect(interceptor.requests).toHaveSize(1)
    expect(interceptor.requests[0].body).toBeInstanceOf(FormData)
    expect(await readFormDataRequest(interceptor.requests[0])).toEqual(payload)
  })
})
