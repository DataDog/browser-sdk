import { matchList, ONE_KIBI_BYTE, safeTruncate, RequestType } from '@datadog/browser-core'
import type { RumConfiguration, GraphQlUrlOption } from '../configuration'
import type { RequestCompleteEvent } from '../requestCollection'

/**
 * arbitrary value, byte precision not needed
 */
const GRAPHQL_PAYLOAD_LIMIT = 32 * ONE_KIBI_BYTE

export interface GraphQlError {
  message: string
  code?: string
  locations?: Array<{ line: number; column: number }>
  path?: Array<string | number>
}

export interface GraphQlMetadata {
  operationType: 'query' | 'mutation' | 'subscription'
  operationName?: string
  variables?: string
  payload?: string
  errors_count?: number
  errors?: GraphQlError[]
}

export function extractGraphQlMetadata(
  request: RequestCompleteEvent,
  graphQlConfig: GraphQlUrlOption
): GraphQlMetadata | undefined {
  const metadata = extractGraphQlRequestMetadata(request.body, graphQlConfig.trackPayload)
  if (!metadata) {
    return
  }

  if (request.type === RequestType.XHR && request.xhr && graphQlConfig.trackResponseErrors) {
    extractGraphQlXhrResponseErrors(request.xhr, (errorsCount, errors) => {
      if (errorsCount !== undefined) {
        metadata.errors_count = errorsCount
      }
      if (errors !== undefined) {
        metadata.errors = errors
      }
    })
  } else if (request.type === RequestType.FETCH) {
    if (request.graphqlErrorsCount !== undefined) {
      metadata.errors_count = request.graphqlErrorsCount
    }
    if (request.graphqlErrors !== undefined) {
      metadata.errors = request.graphqlErrors
    }
  }

  return metadata
}

export function parseGraphQlResponse(
  responseText: string,
  callback: (errorsCount?: number, errors?: GraphQlError[]) => void
) {
  try {
    const response = JSON.parse(responseText)

    if (!response || !Array.isArray(response.errors) || response.errors.length === 0) {
      callback()
      return
    }

    const errors = (response.errors as unknown[]).map((error: unknown) => {
      const errorObj = error as Record<string, unknown>
      const graphqlError: GraphQlError = {
        message: typeof errorObj.message === 'string' ? errorObj.message : 'Unknown GraphQL error',
      }

      const extensions = errorObj.extensions as Record<string, unknown> | undefined
      if (extensions?.code && typeof extensions.code === 'string') {
        graphqlError.code = extensions.code
      }

      if (Array.isArray(errorObj.locations)) {
        graphqlError.locations = (errorObj.locations as unknown[]).map((loc: unknown) => {
          const locObj = loc as Record<string, unknown>
          return {
            line: typeof locObj.line === 'number' ? locObj.line : 0,
            column: typeof locObj.column === 'number' ? locObj.column : 0,
          }
        })
      }

      if (Array.isArray(errorObj.path)) {
        graphqlError.path = errorObj.path as Array<string | number>
      }

      return graphqlError
    })

    callback(errors.length, errors)
  } catch {
    callback()
  }
}

export function findGraphQlConfiguration(url: string, configuration: RumConfiguration): GraphQlUrlOption | undefined {
  return configuration.allowedGraphQlUrls.find((graphQlOption) => matchList([graphQlOption.match], url))
}

export function extractGraphQlRequestMetadata(
  requestBody: unknown,
  trackPayload: boolean = false
): GraphQlMetadata | undefined {
  if (!requestBody || typeof requestBody !== 'string') {
    return
  }

  let graphqlBody: { query?: string; operationName?: string; variables?: unknown }

  try {
    graphqlBody = JSON.parse(requestBody)
  } catch {
    // Not valid JSON
    return
  }

  if (!graphqlBody || !graphqlBody.query) {
    return
  }

  const query = graphqlBody.query.trim()
  const operationType = getOperationType(query)
  const operationName = graphqlBody.operationName

  if (!operationType) {
    return
  }

  let variables: string | undefined
  if (graphqlBody.variables) {
    variables = JSON.stringify(graphqlBody.variables)
  }

  return {
    operationType,
    operationName,
    variables,
    payload: trackPayload ? safeTruncate(query, GRAPHQL_PAYLOAD_LIMIT, '...') : undefined,
  }
}

function getOperationType(query: string) {
  return query.match(/^\s*(query|mutation|subscription)\b/i)?.[1] as 'query' | 'mutation' | 'subscription' | undefined
}

function extractGraphQlXhrResponseErrors(
  xhr: XMLHttpRequest,
  callback: (errorsCount?: number, errors?: GraphQlError[]) => void
) {
  if (typeof xhr.response === 'string') {
    parseGraphQlResponse(xhr.response, callback)
  } else {
    callback()
  }
}
