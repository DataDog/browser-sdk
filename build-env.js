const execSync = require('child_process').execSync
const packageJson = require('./package.json')

const versionPrefix = process.env.VERSION !== 'release' ? 'dev' : packageJson.version
const commitSha1 = execSync('git rev-parse HEAD')
  .toString()
  .trim()

module.exports = {
  TARGET_DATACENTER: process.env.TARGET_DATACENTER || 'us',
  TARGET_ENV: process.env.TARGET_ENV || 'staging',
  VERSION: `${versionPrefix}-${commitSha1}`,
}
