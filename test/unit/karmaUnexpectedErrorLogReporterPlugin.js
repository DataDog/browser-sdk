/**
 * Karma reporter that fails any spec that produces an unexpected console log.
 *
 * Tests that intentionally trigger console output should spy on the relevant method beforehand,
 * which prevents the call from reaching the browser console (and thus this reporter).
 */
function KarmaUnexpectedErrorLogReporter(logger) {
  const log = logger.create('karma-unexpected-error-log')

  // Logs are buffered here between two onSpecComplete calls
  const pendingLogs = new Map() // browser.id -> string[]

  this.onBrowserLog = (browser, message, type) => {
    pendingLogs.getOrInsert(browser.id, []).push(`${type}: ${message}`)
  }

  this.onSpecComplete = (browser, result) => {
    if (!pendingLogs.has(browser.id)) {
      return
    }
    const logs = pendingLogs.get(browser.id)
    pendingLogs.delete(browser.id)

    for (const message of logs) {
      const failure = `Unexpected console call: ${message}`
      log.error(failure)
      result.log.push(failure)
    }
    result.success = false
    browser.lastResult.failed++
  }
}

KarmaUnexpectedErrorLogReporter.$inject = ['logger']

// eslint-disable-next-line import-x/no-default-export
export default {
  'reporter:karma-unexpected-error-log': ['type', KarmaUnexpectedErrorLogReporter],
}
