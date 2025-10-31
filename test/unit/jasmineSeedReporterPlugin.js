function seedReporter(logger) {
  const log = logger.create('jasmine-seed-reporter')
  this.onBrowserComplete = function (browser, result) {
    if (result.order && result.order.random && result.order.seed) {
      log.info(`${browser}: Randomized with seed ${result.order.seed}\n`)
    }
  }
}

seedReporter.$inject = ['logger']

// eslint-disable-next-line import/no-default-export
export default {
  'reporter:jasmine-seed': ['type', seedReporter],
}
