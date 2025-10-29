import { tryToClone } from './utils/responseUtils'
import { readBytesFromStream } from './readBytesFromStream'
import { monitor } from './monitor'

export interface ReadResponseBodyResult {
  body?: string
  limitExceeded: boolean
  error?: Error
}

export interface ReadResponseBodyOptions {
  bytesLimit?: number
  collectBody?: boolean
}

export interface RequestContext {
  xhr?: XMLHttpRequest
  response?: Response
}

/**
 * Reads the response body from an XHR or Fetch request context.
 * For XHR requests, reads directly from xhr.response.
 * For Fetch requests, clones the response and reads from the stream.
 * Optionally truncates the response text if bytesLimit is specified.
 */
export function readResponseBody(
  request: RequestContext,
  callback: (result: ReadResponseBodyResult) => void,
  options: ReadResponseBodyOptions
) {
  if (request.xhr) {
    readXhrResponseBody(request.xhr, callback, options)
  } else if (request.response) {
    readFetchResponseBody(request.response, callback, options)
  } else {
    callback({ body: undefined, limitExceeded: false })
  }
}

function readXhrResponseBody(
  xhr: XMLHttpRequest,
  callback: (result: ReadResponseBodyResult) => void,
  options: ReadResponseBodyOptions
) {
  if (typeof xhr.response === 'string') {
    const truncated = truncateText(xhr.response, options.bytesLimit)
    callback({
      body: truncated.text,
      limitExceeded: truncated.limitExceeded,
    })
  } else {
    callback({
      body: undefined,
      limitExceeded: false,
    })
  }
}

function readFetchResponseBody(
  response: Response,
  callback: (result: ReadResponseBodyResult) => void,
  options: ReadResponseBodyOptions
) {
  const clonedResponse = tryToClone(response)
  if (!clonedResponse || !clonedResponse.body) {
    callback({ body: undefined, limitExceeded: false })
    return
  }

  // Legacy Edge support: use response.text() instead of reading the stream
  if (!window.TextDecoder) {
    clonedResponse.text().then(
      monitor((text) => {
        const truncated = truncateText(text, options.bytesLimit)
        callback({
          body: truncated.text,
          limitExceeded: truncated.limitExceeded,
        })
      }),
      monitor((error) => {
        callback({
          body: undefined,
          limitExceeded: false,
          error,
        })
      })
    )
    return
  }

  const bytesLimit = options.bytesLimit ?? Number.POSITIVE_INFINITY
  const collectBody = options.collectBody ?? true
  readBytesFromStream(
    clonedResponse.body,
    (error, bytes, limitExceeded) => {
      if (error) {
        callback({
          body: undefined,
          limitExceeded: false,
          error,
        })
        return
      }

      if (!collectBody || !bytes) {
        callback({ body: undefined, limitExceeded: false })
        return
      }

      let responseText = new TextDecoder().decode(bytes)
      if (limitExceeded) {
        responseText += '...'
      }

      callback({
        body: responseText,
        limitExceeded: limitExceeded || false,
      })
    },
    {
      bytesLimit,
      collectStreamBody: collectBody,
    }
  )
}

function truncateText(text: string, bytesLimit?: number): { text: string; limitExceeded: boolean } {
  if (bytesLimit === undefined || text.length <= bytesLimit) {
    return { text, limitExceeded: false }
  }

  return {
    text: `${text.substring(0, bytesLimit)}...`,
    limitExceeded: true,
  }
}
