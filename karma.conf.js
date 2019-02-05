const webpackConfig = require("./webpack.config")(null, "development");

module.exports = function(config) {
  config.set({
    browsers: ["ChromeHeadlessNoSandbox"],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox"]
      }
    },
    files: ["**/*.unit.ts"],
    frameworks: ["mocha", "chai"],
    preprocessors: {
      "src/**/*.unit.ts": ["webpack"]
    },
    singleRun: true,
    webpack: {
      mode: "development",
      stats: "minimal",
      module: webpackConfig.module,
      resolve: webpackConfig.resolve
    },
    webpackMiddleware: {
      stats: "errors-only",
      logLevel: "warn"
    }
  });
};
