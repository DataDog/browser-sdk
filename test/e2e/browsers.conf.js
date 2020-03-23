// Defines a list of browser capabilities on which the e2e tests should be run on
// crossbrowsertesting.  Due to a bug in the crossbrowsertesting API, we can't use the standard
// capabilities for some browsers: we have to rely on "*_api_name" attributes instead.  This has
// been reported to the crossbrowsertesting support and may be fixed one day.

// You can get the list of supported capabilities with:
//   curl 'https://crossbrowsertesting.com/api/v3/selenium/browsers?format=json'
// Documentation: https://crossbrowsertesting.com/apidocs/v3/selenium.html#!/default/get_selenium_browsers

// Each element of the list represents an OS, and in each OS there is a list of browsers.  You can
// find:
// * standard capabilities properties in `caps` properties (in the OS and browser objects);
// * `os_api_name` property in OS `api_name` properties;
// * `browser_api_name` property in browser `api_name` properties.

module.exports = [
  {
    os_api_name: 'Mac10.14',
    browserName: 'Safari',
    browser_api_name: 'Safari12',
  },
  {
    os_api_name: 'Win10',
    browserName: 'Microsoft Edge 18',
    browser_api_name: 'Edge18',
  },
  {
    os_api_name: 'Win10',
    browserName: 'Firefox 70',
    browser_api_name: 'FF70',
  },
  {
    os_api_name: 'Pixel4-And10',
    browserName: 'Chrome Mobile 79',
    browser_api_name: 'MblChrome79',
  },
  // Safari mobile on iOS 12.0 does not support
  // the way we flush events on page change
  // wait for more recent version available on cbt
  // {
  //   deviceName: "iPhone XR Simulator",
  //   platformName: "iOS",
  //   platformVersion: "12.0",
  //   browserName: "Safari",
  //   deviceOrientation: 'portrait'
  // },
]
