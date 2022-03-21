const { logAndExit, sendSlackMessage } = require('../utils')

async function main() {
  let channel = process.argv[2]
  const message = process.argv[3]
  await sendSlackMessage(channel, message)
}

main().catch(logAndExit)
