import { buildUrl, isNonEmptyArray, matchList, ONE_KIBI_BYTE, safeTruncate, tryJsonParse } from '@datadog/browser-core'
import type { RumConfiguration, GraphQlUrlOption } from '../configuration'
import type { RequestCompleteEvent } from '../requestCollection'

/**
 * arbitrary value, byte precision not needed
 */
const GRAPHQL_PAYLOAD_LIMIT = 32 * ONE_KIBI_BYTE

interface RawGraphQlMetadata {
  query?: string
  operationName?: string
  variables?: string
}

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
  const metadata = extractGraphQlRequestMetadata(request, graphQlConfig.trackPayload)
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
  const response = tryJsonParse(responseText)

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
  request: Pick<RequestCompleteEvent, 'method' | 'url' | 'requestBody'>,
  trackPayload: boolean = false
): GraphQlMetadata | undefined {
  let rawMetadata: RawGraphQlMetadata | undefined

  if (request.method === 'POST') {
    rawMetadata = extractFromBody(request.requestBody)
  } else if (request.method === 'GET') {
    rawMetadata = extractFromUrlQueryParams(request.url)
  }

  if (!rawMetadata) {
    return
  }

  return sanitizeGraphQlMetadata(rawMetadata, trackPayload)
}

function extractFromBody(requestBody: unknown): RawGraphQlMetadata | undefined {
  if (!requestBody || typeof requestBody !== 'string') {
    return
  }

  const graphqlBody = tryJsonParse<{
    query?: string
    operationName?: string
    variables?: unknown
  }>(requestBody)

  if (!graphqlBody) {
    return
  }

  return {
    query: graphqlBody.query,
    operationName: graphqlBody.operationName,
    variables: graphqlBody.variables ? JSON.stringify(graphqlBody.variables) : undefined,
  }
}

function extractFromUrlQueryParams(url: string): RawGraphQlMetadata {
  const searchParams = buildUrl(url).searchParams
  const variablesParam = searchParams.get('variables')
  const variables = variablesParam && tryJsonParse(variablesParam) !== undefined ? variablesParam : undefined

  return {
    query: searchParams.get('query') || undefined,
    operationName: searchParams.get('operationName') || undefined,
    variables,
  }
}

function sanitizeGraphQlMetadata(rawMetadata: RawGraphQlMetadata, trackPayload: boolean): GraphQlMetadata {
  let operationType: 'query' | 'mutation' | 'subscription' | undefined
  let payload: string | undefined
  let variables: string | undefined

  if (rawMetadata.query) {
    const trimmedQuery = rawMetadata.query.trim()
    operationType = getOperationType(trimmedQuery)
    if (trackPayload) {
      payload = safeTruncate(trimmedQuery, GRAPHQL_PAYLOAD_LIMIT, '...')
    }
  }

  if (rawMetadata.variables) {
    variables = rawMetadata.variables
  }

  return {
    operationType,
    operationName: rawMetadata.operationName,
    variables,
    payload,
  }
}

function getOperationType(query: string) {
  return query.match(/^\s*(query|mutation|subscription)\b/i)?.[1] as 'query' | 'mutation' | 'subscription' | undefined
}
