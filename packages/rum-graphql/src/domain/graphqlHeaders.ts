// Custom headers used to pass GraphQL information from the Apollo Link to the SDK
// These headers are not sent to the server, they are intercepted and removed by the SDK
export const DATADOG_GRAPH_QL_OPERATION_TYPE_HEADER = '_dd-graphql-operation-type'
export const DATADOG_GRAPH_QL_OPERATION_NAME_HEADER = '_dd-graphql-operation-name'
export const DATADOG_GRAPH_QL_VARIABLES_HEADER = '_dd-graphql-variables'

export function isDatadogGraphQLHeader(headerName: string): boolean {
  return (
    headerName === DATADOG_GRAPH_QL_OPERATION_TYPE_HEADER ||
    headerName === DATADOG_GRAPH_QL_OPERATION_NAME_HEADER ||
    headerName === DATADOG_GRAPH_QL_VARIABLES_HEADER
  )
}
