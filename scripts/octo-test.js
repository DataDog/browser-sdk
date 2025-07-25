const { printLog, runMain } = require('./lib/executionUtils')
const { command } = require('./lib/command')

runMain(() => {
  printLog('Start')

  const version = command`dd-octo-sts version`.withEnvironment(process.env.DDOCTOSTS_ID_TOKEN).run()
  printLog(`Octo STS version: ${version}`)

  const test = command`dd-octo-sts debug --scope DataDog/dd-octo-sts-sandbox --policy self.gitlab.read`
    .withEnvironment(process.env.DDOCTOSTS_ID_TOKEN)
    .run()
  printLog(`Octo STS debug: ${test}`)
})
