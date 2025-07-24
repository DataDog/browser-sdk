/* eslint-disable local-rules/disallow-side-effects */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloLink, type Operation } from '@apollo/client'
import type {
  DefinitionNode,
  OperationDefinitionNode,
  OperationTypeNode, // "query" | "mutation" | "subscription"
} from 'graphql'
import { Kind } from 'graphql'

import {
  DATADOG_GRAPH_QL_OPERATION_TYPE_HEADER,
  DATADOG_GRAPH_QL_OPERATION_NAME_HEADER,
  DATADOG_GRAPH_QL_VARIABLES_HEADER,
} from './graphqlHeaders'

export function createDatadogLink(): ApolloLink {
  return new ApolloLink((operation, forward) => {
    if (!forward) {
      return null
    }

    const operationType = getOperationType(operation)
    const operationName = getOperationName(operation)
    const variables = getVariables(operation)

    operation.setContext(({ headers = {} }) => ({
      headers: {
        ...headers,
        ...(operationType && {
          [DATADOG_GRAPH_QL_OPERATION_TYPE_HEADER]: operationType,
        }),
        ...(operationName && {
          [DATADOG_GRAPH_QL_OPERATION_NAME_HEADER]: operationName,
        }),
        ...(variables && {
          [DATADOG_GRAPH_QL_VARIABLES_HEADER]: variables,
        }),
      },
    }))

    return forward(operation)
  })
}

function isOperationDefinitionNode(node: DefinitionNode): node is OperationDefinitionNode {
  return node.kind === Kind.OPERATION_DEFINITION
}

function getOperationType(op: Operation): OperationTypeNode | undefined {
  const opDef = op.query.definitions.find(isOperationDefinitionNode)
  return opDef?.operation
}

function getOperationName(operation: Operation): string | undefined {
  return operation.operationName || undefined
}

function getVariables(operation: Operation): string | undefined {
  if (operation.variables && Object.keys(operation.variables).length > 0) {
    try {
      return JSON.stringify(operation.variables)
    } catch {
      // If variables can't be serialized, ignore them
      return undefined
    }
  }
  return undefined
}
