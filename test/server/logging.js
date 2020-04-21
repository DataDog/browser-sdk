const fs = require('fs')
const path = require('path')
const morgan = require('morgan')

morgan.token('body', (req, res) => extractBody(req, res))
morgan.token('specId', function(req) {
  return req.query['spec-id']
})
const stream = fs.createWriteStream(path.join(__dirname, 'test-server.log'), { flags: 'a' })

function extractBody(req, res) {
  if (isValidBody(req.body)) {
    return `\n[${req.query['spec-id']}] ${req.body}`
  }
  if (isValidBody(res.body)) {
    return `\n[${req.query['spec-id']}] ${res.body}`
  }
}

function isValidBody(body) {
  return body && JSON.stringify(body) !== '{}'
}

module.exports = {
  logging: morgan('[:specId] :method :url :status :body', { stream }),
}
