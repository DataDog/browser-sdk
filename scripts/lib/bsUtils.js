const { fetchHandlingError } = require('../lib/executionUtils')

async function browserStackRequest(url, options) {
  const response = await fetchHandlingError(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}`).toString('base64')}`,
    },
    ...options,
  })
  return response.json()
}

module.exports = {
  browserStackRequest,
}
