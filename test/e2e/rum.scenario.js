const expect = require('chai').expect
const request = require('request').defaults({ baseUrl: 'http://localhost:3000' })

describe('rum', () => {
  afterEach(async () => {
    expect(await retrieveMonitoringErrors()).to.be.empty
    await resetServerState()
  })

  it('should send display event on load', async () => {
    browser.url('/page.html')
    flushLogs()
    const logs = await retrieveLogTypes()
    expect(logs).to.contain('display')
  })
})

function flushLogs() {
  browser.url('/empty.html')
}

function retrieveLogTypes() {
  return fetch('/logs').then((logs) => JSON.parse(logs).map((log) => log.data.entryType))
}

function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors) => JSON.parse(monitoringErrors))
}

function resetServerState() {
  return fetch('/reset')
}

function fetch(url) {
  return new Promise(function(resolve, reject) {
    request.get(url, (err, response, body) => {
      if (err) {
        reject(err)
      }
      resolve(body)
    })
  })
}
