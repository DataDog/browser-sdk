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
    files: ["src/**/*.unit.ts", "src/**/*.integration.ts"],
    frameworks: ["mocha", "chai", "sinon"],
    preprocessors: {
      "src/**/*.unit.ts": ["webpack"],
      "src/**/*.integration.ts": ["webpack"]
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
