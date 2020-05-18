module.exports = function getTestReportDirectory() {
  if (process.env.CI_JOB_NAME) {
    return `test-report/${process.env.CI_JOB_NAME}`
  }
}
