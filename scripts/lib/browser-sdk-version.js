const lernaJson = require('../../lerna.json')

function getBrowserSdkVersion() {
  return lernaJson.version
}

module.exports = {
  getBrowserSdkVersion,
}
