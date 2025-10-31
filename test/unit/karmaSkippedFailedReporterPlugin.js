function KarmaSkippedFailedReporter(logger) {
  var log = logger.create('karma-skipped-failed')

  this.onSpecComplete = (browser, result) => {
    if (result.skipped && !result.success) {
      log.warn('Failing skipped test:')
      log.warn(browser.name)
      log.warn(result.fullName)
      log.warn(result.log.join('\n'))
    }
  }
}

KarmaSkippedFailedReporter.$inject = ['logger']

// eslint-disable-next-line import/no-default-export
export default {
  'reporter:karma-skipped-failed': ['type', KarmaSkippedFailedReporter],
}
