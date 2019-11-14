const execSync = require('child_process').execSync
const packageJson = require('./package.json')

module.exports = {
  TARGET_DC: process.env.TARGET_DC || 'us',
  TARGET_ENV: process.env.TARGET_ENV || 'staging',
  VERSION: `${process.env.VERSION !== 'release' ? 'dev' : packageJson.version}-${execSync('git rev-parse HEAD')
    .toString()
    .trim()}`,
}
