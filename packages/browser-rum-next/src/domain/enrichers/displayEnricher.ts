function displayEnricher() {
  return {
    name: 'display',
    transform(data: Record<string, unknown>) {
      return {
        ...data,
        display: {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      }
    },
  }
}

export { displayEnricher }
