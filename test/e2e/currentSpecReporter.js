let currentSpec = undefined

class CurrentSpecReporter {
  specStarted(spec) {
    currentSpec = spec.fullName
  }

  specDone() {
    currentSpec = undefined
  }
}

module.exports = {
  CurrentSpecReporter,
  getCurrentSpec: () => currentSpec,
}
