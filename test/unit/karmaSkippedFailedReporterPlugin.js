function KarmaSkippedFailedReporter(baseReporterDecorator, logger) {
  var log = logger.create('karma-skipped-failed')

  baseReporterDecorator(this)

  this.specSkipped = this.specFailure = (browser, result) => {
    if (result.skipped && !result.success) {
      log.warn('Failing skipped test:')
      log.warn(browser.name)
      log.warn(result.fullName)
      log.warn(result.log.join('\n'))
    }
  }
}

KarmaSkippedFailedReporter.$inject = ['baseReporterDecorator', 'logger']

module.exports = {
  'reporter:karma-skipped-failed': ['type', KarmaSkippedFailedReporter],
}
