export interface CiTestWindow extends Window {
  Cypress?: {
    env: (key: string) => string | undefined
  }
}

export function getCiTestContext() {
  const testExecutionId = (window as CiTestWindow).Cypress?.env('traceId')

  if (typeof testExecutionId === 'string') {
    return {
      test_execution_id: testExecutionId,
    }
  }
}
