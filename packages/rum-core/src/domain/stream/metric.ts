export function createWeightAverageMetric() {
  let lastUpdate = 0
  let weight = 0
  let value: number | undefined

  return {
    get value() {
      console.log('>>>', value)
      return value
    },
    update(newLastUpdate: number, newValue: number) {
      if (newLastUpdate <= lastUpdate) {
        return
      }

      const newWeight = newLastUpdate - lastUpdate
      value = ((value ?? 0) * weight + newValue * newWeight) / (weight + newWeight)
      weight += newWeight
      lastUpdate = newLastUpdate
    },
  }
}

export function createLastMetric() {
  let lastUpdate = 0
  let value: number | undefined

  return {
    get value() {
      return value
    },
    update(newLastUpdate: number, newValue: number) {
      if (newLastUpdate <= lastUpdate) {
        return
      }

      value = newValue
      lastUpdate = newLastUpdate
    },
  }
}
