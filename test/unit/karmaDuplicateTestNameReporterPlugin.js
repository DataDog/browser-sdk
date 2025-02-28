function KarmaDuplicateTestNameReporter(logger) {
  var log = logger.create('karma-duplicate-test-name')

  var testNames = new Set()
  var duplicatedTestNames = new Map()

  this.onRunStart = () => {
    testNames.clear()
    duplicatedTestNames.clear()
  }

  this.onRunComplete = () => {
    if (duplicatedTestNames.size > 0) {
      log.error('Duplicate tests:')

      for (const [name, count] of duplicatedTestNames) {
        log.error(`${name} (${count} times)`)
      }
    }
  }

  this.onSpecComplete = (browser, result) => {
    const testName = `[${browser.name}] ${result.fullName}`

    if (testNames.has(testName)) {
      if (!duplicatedTestNames.has(testName)) {
        duplicatedTestNames.set(testName, 2)
      } else {
        duplicatedTestNames.set(testName, duplicatedTestNames.get(testName) + 1)
      }
    }

    testNames.add(testName)
  }
}

KarmaDuplicateTestNameReporter.$inject = ['logger']

module.exports = {
  'reporter:karma-duplicate-test-name': ['type', KarmaDuplicateTestNameReporter],
}
