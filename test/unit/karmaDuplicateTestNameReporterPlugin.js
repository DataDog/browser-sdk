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

  this.onSpecComplete = (_browser, { fullName }) => {
    if (testNames.has(fullName)) {
      if (!duplicatedTestNames.has(fullName)) {
        duplicatedTestNames.set(fullName, 2)
      } else {
        duplicatedTestNames.set(fullName, duplicatedTestNames.get(fullName) + 1)
      }
    }

    testNames.add(fullName)
  }
}

KarmaDuplicateTestNameReporter.$inject = ['logger']

module.exports = {
  'reporter:karma-duplicate-test-name': ['type', KarmaDuplicateTestNameReporter],
}
