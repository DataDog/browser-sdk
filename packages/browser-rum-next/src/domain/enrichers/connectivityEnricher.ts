function connectivityEnricher() {
  return {
    name: 'connectivity',
    transform(data: Record<string, unknown>) {
      const connection = (navigator as any).connection
      return {
        ...data,
        connectivity: {
          status: navigator.onLine ? 'connected' : 'not_connected',
          ...(connection && {
            effective_type: connection.effectiveType,
            interfaces: connection.type ? [connection.type] : undefined,
          }),
        },
      }
    },
  }
}

export { connectivityEnricher }
