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
  if (!requestBody) {
    if (request?.input instanceof Request) {
      display.warn('GraphQL tracking does not yet support Request objects.')
    }
    return
  }
  if (typeof requestBody !== 'string') {
    const bodyType = requestBody.constructor.name || typeof requestBody
    display.warn(
      `GraphQL tracking does not support body type: ${bodyType}. Only string bodies are currently supported.`
    )
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
