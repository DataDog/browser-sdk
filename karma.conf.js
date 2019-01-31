module.exports = function(config) {
  config.set({
    browsers: ["ChromeHeadless"],
    files: ["src/**/*.unit.js"],
    frameworks: ["mocha", "chai"],
    singleRun: true
  });
};
