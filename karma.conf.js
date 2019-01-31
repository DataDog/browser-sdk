const webpackConfig = require("./webpack.config")(null, "development");

module.exports = function(config) {
  config.set({
    browsers: ["ChromeHeadless"],
    files: ["**/*.unit.ts"],
    frameworks: ["mocha", "chai"],
    preprocessors: {
      "src/**/*.unit.ts": ["webpack"]
    },
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
