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
  operationType?: 'query' | 'mutation' | 'subscription'
  operationName?: string
  variables?: string
  payload?: string
  error_count?: number
  errors?: GraphQlError[]
}

export function extractGraphQlMetadata(
  request: RequestCompleteEvent,
  graphQlConfig: GraphQlUrlOption
): GraphQlMetadata | undefined {
  const metadata = extractGraphQlRequestMetadata(request.requestBody, graphQlConfig.trackPayload, request.url)
  if (!metadata) {
    return
  }

  if (graphQlConfig.trackResponseErrors && request.responseBody) {
    const responseErrors = parseGraphQlResponse(request.responseBody)
    if (responseErrors) {
      metadata.error_count = responseErrors.length
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
  trackPayload: boolean = false,
  url?: string
): GraphQlMetadata | undefined {
  if (requestBody && typeof requestBody === 'string') {
    return extractFromBody(requestBody, trackPayload)
  }
  // Fallback for persisted queries
  if (url) {
    return extractFromUrlQueryParams(url, trackPayload)
  }
}

function extractFromBody(requestBody: string, trackPayload: boolean): GraphQlMetadata | undefined {
  let graphqlBody: {
    query?: string
    operationName?: string
    variables?: unknown
  }

  try {
    graphqlBody = JSON.parse(requestBody)
  } catch {
    // Not valid JSON
    return
  }

  if (!graphqlBody) {
    return
  }

  return buildGraphQlMetadata({
    query: graphqlBody.query,
    operationName: graphqlBody.operationName,
    variables: graphqlBody.variables ? JSON.stringify(graphqlBody.variables) : undefined,
    trackPayload,
  })
}

function extractFromUrlQueryParams(url: string, trackPayload: boolean): GraphQlMetadata | undefined {
  const queryStringIndex = url.indexOf('?')
  if (queryStringIndex === -1) {
    return
  }

  const searchParams = new URLSearchParams(url.slice(queryStringIndex + 1))
  const variablesParam = searchParams.get('variables')

  return buildGraphQlMetadata({
    query: searchParams.get('query') || undefined,
    operationName: searchParams.get('operationName') || undefined,
    variables: parseVariablesParam(variablesParam),
    trackPayload,
  })
}

function parseVariablesParam(variablesParam: string | null): string | undefined {
  if (!variablesParam) {
    return
  }
  try {
    // Parse to validate it's valid JSON, then keep the string
    JSON.parse(variablesParam)
    return variablesParam
  } catch {
    // Invalid JSON in variables, ignore
  }
}

function buildGraphQlMetadata({
  query,
  operationName,
  variables,
  trackPayload,
}: {
  query?: string
  operationName?: string
  variables?: string
  trackPayload: boolean
}): GraphQlMetadata {
  let operationType: 'query' | 'mutation' | 'subscription' | undefined
  let payload: string | undefined

  if (query) {
    const trimmedQuery = query.trim()
    operationType = getOperationType(trimmedQuery)
    if (trackPayload) {
      payload = safeTruncate(trimmedQuery, GRAPHQL_PAYLOAD_LIMIT, '...')
    }
  }

  return {
    operationType,
    operationName,
    variables,
    payload,
  }
}

function getOperationType(query: string) {
  return query.match(/^\s*(query|mutation|subscription)\b/i)?.[1] as 'query' | 'mutation' | 'subscription' | undefined
}
