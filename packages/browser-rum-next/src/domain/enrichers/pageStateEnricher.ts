function pageStateEnricher() {
  return {
    name: 'pageState',
    transform(data: Record<string, unknown>) {
      return {
        ...data,
        page_state: typeof document !== 'undefined' ? document.visibilityState : 'hidden',
      }
    },
  }
}

export { pageStateEnricher }
