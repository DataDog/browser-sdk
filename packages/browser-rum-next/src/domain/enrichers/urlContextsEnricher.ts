function urlContextsEnricher() {
  return {
    name: 'urlContexts',
    transform(data: Record<string, unknown>) {
      const existingView = data.view as Record<string, unknown> | undefined
      return {
        ...data,
        view: {
          ...(existingView || {}),
          url: existingView?.url || window.location.href,
          referrer: existingView?.referrer ?? document.referrer,
        },
      }
    },
  }
}

export { urlContextsEnricher }
