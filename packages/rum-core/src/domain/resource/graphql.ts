import { display, matchList, ONE_KIBI_BYTE, safeTruncate } from '@datadog/browser-core'
import type { RumConfiguration, GraphQlUrlOption } from '../configuration'
import type { RequestCompleteEvent } from '../requestCollection'

/**
 * arbitrary value, byte precision not needed
 */
const GRAPHQL_PAYLOAD_LIMIT = 32 * ONE_KIBI_BYTE

export interface GraphQlMetadata {
  operationType: 'query' | 'mutation' | 'subscription'
  operationName?: string
  variables?: string
  payload?: string
}

export function findGraphQlConfiguration(url: string, configuration: RumConfiguration): GraphQlUrlOption | undefined {
  return configuration.allowedGraphQlUrls.find((graphQlOption) => matchList([graphQlOption.match], url))
}

export function extractGraphQlMetadata(
  requestBody: unknown,
  trackPayload: boolean = false,
  request?: RequestCompleteEvent
): GraphQlMetadata | undefined {
  if (!requestBody || typeof requestBody !== 'string') {
    if (request?.input && typeof request.input === 'object' && 'body' in request.input) {
      display.warn('GraphQL tracking does not support Request objects with body streams.')
    } else if (requestBody !== null && requestBody !== undefined) {
      const bodyType = requestBody.constructor.name || typeof requestBody
      display.warn(`GraphQL tracking does not support body type: ${bodyType}. Only string bodies are supported.`)
    }
    return undefined
  }

  let graphqlBody: { query?: string; operationName?: string; variables?: unknown }

  try {
    graphqlBody = JSON.parse(requestBody)
  } catch {
    // Not valid JSON
    return undefined
  }

  if (!graphqlBody || !graphqlBody.query) {
    return undefined
  }

  const query = graphqlBody.query.trim()
  const operationType = getOperationType(query)
  const operationName = graphqlBody.operationName

  if (!operationType) {
    return undefined
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
