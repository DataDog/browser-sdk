const execSync = require('child_process').execSync
const lernaJson = require('../lerna.json')

let sdkVersion
switch (process.env.BUILD_MODE) {
  case 'release':
    sdkVersion = lernaJson.version
    break
  case 'canary':
  case 'staging':
    const commitSha1 = execSync('git rev-parse HEAD').toString().trim()
    sdkVersion = `${lernaJson.version}+${commitSha1}`
    break
  default:
    sdkVersion = 'dev'
    break
}

module.exports = {
  BUILD_MODE: process.env.BUILD_MODE,
  SDK_VERSION: sdkVersion,
}
