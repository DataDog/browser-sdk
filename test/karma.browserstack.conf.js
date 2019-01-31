const karmaBaseConf = require("./karma.base.conf");

// Capabilities generator: https://www.browserstack.com/automate/capabilities

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    browsers: ["EDGE", "FIREFOX", "SAFARI"],
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY
    },
    customLaunchers: {
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
      }
    }
  });
};
