import { getSyntheticsResultId, getSyntheticsTestId, willSyntheticsInjectRum } from '@datadog/browser-core'

export function getSyntheticsContext() {
  const testId = getSyntheticsTestId()
  const resultId = getSyntheticsResultId()

  if (testId && resultId) {
    return {
      test_id: testId,
      result_id: resultId,
      injected: willSyntheticsInjectRum(),
    }
  }
}
