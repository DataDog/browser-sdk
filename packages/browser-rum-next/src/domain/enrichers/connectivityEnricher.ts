function connectivityEnricher() {
  return {
    name: 'connectivity',
    transform(data: Record<string, unknown>) {
      const connection = (navigator as any).connection
      if (!connection) return data
      return {
        ...data,
        connectivity: {
          effective_type: connection.effectiveType,
          type: connection.type,
        },
      }
    },
  }
}

export { connectivityEnricher }
