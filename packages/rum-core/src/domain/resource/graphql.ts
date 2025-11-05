import { isNonEmptyArray, matchList, ONE_KIBI_BYTE, safeTruncate } from '@datadog/browser-core'
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
  const metadata = extractGraphQlRequestMetadata(request.requestBody, graphQlConfig.trackPayload)
  if (!metadata) {
    return
  }

  if (graphQlConfig.trackResponseErrors && request.responseBody) {
    const responseErrors = parseGraphQlResponse(request.responseBody)
    if (responseErrors) {
      metadata.errors_count = responseErrors.length
      metadata.errors = responseErrors
    }
  }

  return metadata
}

export function parseGraphQlResponse(responseText: string): GraphQlError[] | undefined {
  let response: unknown
  try {
    response = JSON.parse(responseText)
  } catch {
    // Invalid JSON response
    return
  }

  if (!response || typeof response !== 'object') {
    return
  }

  const responseObj = response as Record<string, unknown>

  if (!isNonEmptyArray(responseObj.errors)) {
    return
  }

  const errors = (responseObj.errors as Array<Record<string, unknown>>).map((error) => {
    const graphqlError: GraphQlError = {
      message: error.message as string,
      path: error.path as Array<string | number>,
      locations: error.locations as Array<{ line: number; column: number }>,
      code: (error.extensions as Record<string, unknown> | undefined)?.code as string,
    }

    return graphqlError
  })

  return errors
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
