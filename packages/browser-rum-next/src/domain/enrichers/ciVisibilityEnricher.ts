function getCiContext(): Record<string, unknown> | undefined {
  const ci = (window as any).__DD_CITEST__
  if (!ci) return undefined
  return {
    test_execution_id: ci.testExecutionId,
  }
}

function ciVisibilityEnricher() {
  const ciContext = getCiContext()

  return {
    name: 'ciVisibility',
    transform(data: Record<string, unknown>) {
      if (!ciContext) return data
      return { ...data, ci_test: ciContext }
    },
  }
}

export { ciVisibilityEnricher }
