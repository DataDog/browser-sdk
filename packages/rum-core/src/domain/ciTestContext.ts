interface CITestWindow extends Window {
  Cypress?: {
    env: (key: string) => string | undefined
  }
}

export function getCITestContext() {
  const testExecutionId = (window as CITestWindow).Cypress?.env('traceId')

  if (typeof testExecutionId === 'string') {
    return {
      test_execution_id: testExecutionId,
    }
  }
}
