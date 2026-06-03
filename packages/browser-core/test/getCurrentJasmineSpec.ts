let currentSpec: jasmine.SpecResult | null = null

export function getCurrentJasmineSpec() {
  return currentSpec
}

jasmine.getEnv().addReporter({
  specStarted(specResult) {
    currentSpec = specResult
  },
  specDone() {
    currentSpec = null
  },
})
