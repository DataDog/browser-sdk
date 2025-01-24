let currentSpec: jasmine.SpecResult | null = null

export function getCurrentJasmineSpec() {
  if (typeof globalThis['jasmine'] !== 'object') {
    throw new Error('Not inside a Jasmine test')
  }
  return currentSpec
}

if (typeof globalThis['jasmine'] === 'object') {
  globalThis['jasmine'].getEnv().addReporter({
    specStarted(specResult) {
      currentSpec = specResult
    },
    specDone() {
      currentSpec = null
    },
  })
}
