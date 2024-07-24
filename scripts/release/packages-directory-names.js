const { readdirSync } = require('fs')
const PACKAGES_DIRECTORY_NAMES = readdirSync('../../packages')

module.exports = {
  packagesDirectoryNames: PACKAGES_DIRECTORY_NAMES,
}
