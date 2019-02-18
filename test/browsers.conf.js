// Capabilities generator: https://www.browserstack.com/automate/capabilities

module.exports = {
  EDGE: {
    base: "BrowserStack",
    browser: "Edge",
    browser_version: "18.0",
    os: "Windows",
    os_version: "10"
  },
  FIREFOX: {
    base: "BrowserStack",
    browser: "firefox",
    browser_version: "65.0 beta",
    os: "Windows",
    os_version: "10"
  },
  SAFARI: {
    base: "BrowserStack",
    browser: "Safari",
    browser_version: "12.0",
    os: "OS X",
    os_version: "Mojave"
  },
  IE_11: {
    base: "BrowserStack",
    browser: "IE",
    browser_version: "11.0",
    os: "Windows",
    os_version: "7"
  },
  IE_10: {
    base: "BrowserStack",
    browser: "IE",
    browser_version: "10.0",
    os: "Windows",
    os_version: "7"
  },
  IE_9: {
    base: "BrowserStack",
    browser: "IE",
    browser_version: "9.0",
    os: "Windows",
    os_version: "7"
  },
  ANDROID: {
    base: "BrowserStack",
    device: "Google Pixel 3 XL",
    os: "android",
    os_version: "9.0",
    real_mobile: "true"
  }
};
