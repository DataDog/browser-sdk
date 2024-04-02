const fs = require('fs')
const path = require('path')
const { command } = require('../../lib/command')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const filePath = path.join(__dirname, '../../../datadog-ci.synthetics.json')
const apiKey = getOrg2ApiKey()
const appKey = getOrg2AppKey()

function updateStartUrl(prNumber) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file')
    } else {
      const json = JSON.parse(data)
      json.tests[0].config.startUrl += prNumber

      fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8', (err) => {
        if (err) {
          console.error('Error writing file')
        }
      })
    }
  })
}

function syntheticTrigger() {
  command`datadog-ci synthetics run-tests --apiKey ${apiKey} --appKey ${appKey} --files ${filePath}`.run()
}

module.exports = {
  syntheticTrigger,
  updateStartUrl,
}
