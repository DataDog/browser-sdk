// Defines a list of browser capabilities on which the e2e tests should be run on
// crossbrowsertesting.  Due to a bug in the crossbrowsertesting API, we can't use the standard
// capabilities for some browsers: we have to rely on "*_api_name" attributes instead.  This has
// been reported to the crossbrowsertesting support and may be fixed one day.

module.exports = [
  {
    platform: 'Windows 10',
    browserName: 'Chrome',
    version: '77',
  },
  {
    browserName: 'Safari',
    browser_api_name: 'Safari12',
    os_api_name: 'Mac10.14',
  },
]
