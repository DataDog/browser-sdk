const { fetch } = require('../lib/execution-utils')

async function browserStackRequest(url, options) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}`).toString('base64')}`,
    },
    ...options,
  })
  return JSON.parse(response)
}

module.exports = {
  browserStackRequest,
}
