const execSync = require('child_process').execSync
const packageJson = require('./package.json')

let version
switch (process.env.VERSION) {
  case 'release':
    version = packageJson.version
    break
  case 'staging':
    const commitSha1 = execSync('git rev-parse HEAD')
      .toString()
      .trim()
    version = `${packageJson.version}+${commitSha1}`
    break
  default:
    version = 'dev'
    break
}

module.exports = {
  TARGET_DATACENTER: process.env.TARGET_DATACENTER || 'us',
  TARGET_ENV: process.env.TARGET_ENV || 'staging',
  VERSION: version,
}
