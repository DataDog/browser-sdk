function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`))
  return match?.[1]
}

function getSyntheticsContext(): Record<string, unknown> | undefined {
  const testId =
    (window as any)._DATADOG_SYNTHETICS_BROWSER_TEST_ID ||
    getCookie('datadog-synthetics-browser-test-id')
  const resultId =
    (window as any)._DATADOG_SYNTHETICS_BROWSER_RESULT_ID ||
    getCookie('datadog-synthetics-browser-result-id')

  if (!testId) return undefined

  return {
    test_id: testId,
    result_id: resultId,
    injected: !!(window as any)._DATADOG_SYNTHETICS_INJECTS_RUM,
  }
}

function syntheticsEnricher() {
  const syntheticsContext = getSyntheticsContext()

  return {
    name: 'synthetics',
    transform(data: Record<string, unknown>) {
      if (!syntheticsContext) return data
      return { ...data, synthetics: syntheticsContext }
    },
  }
}

export { syntheticsEnricher, getSyntheticsContext }
