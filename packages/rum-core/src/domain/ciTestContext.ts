interface CITestWindow extends Window {
  Cypress?: {
    env: (key: string) => string | undefined
  }
}

export function getCITestContext() {
  const isCypress = (window as CITestWindow).Cypress
  const testExecutionId = (window as CITestWindow).Cypress?.env('traceId')

  if (isCypress && typeof testExecutionId === 'string') {
    return {
      test_execution_id: testExecutionId,
    }
  }
}
