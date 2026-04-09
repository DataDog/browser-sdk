function getPrefix(browser) {
  return `[${browser.name}] `
}

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

  this.onBrowserStart = (browser) => {
    const prefix = getPrefix(browser)
    for (const name of testNames) {
      if (name.startsWith(prefix)) {
        testNames.delete(name)
        duplicatedTestNames.delete(name)
      }
    }
  }

  this.onSpecComplete = (browser, result) => {
    const testName = `${getPrefix(browser)}${result.fullName}`

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

// eslint-disable-next-line import/no-default-export
export default {
  'reporter:karma-duplicate-test-name': ['type', KarmaDuplicateTestNameReporter],
}
