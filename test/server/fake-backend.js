module.exports = (app) => {
  let logs = {}
  let rumEvents = {}
  let monitoring = {}

  app.post('/logs', (req, res) => {
    req.body.split('\n').forEach((log) => addSpecEvent(logs, getSpecId(req), log))
    res.send('ok')
  })
  app.get('/logs', (req, res) => send(res, logs[getSpecId(req)]))

  app.post('/rum', (req, res) => {
    req.body.split('\n').forEach((rumEvent) => addSpecEvent(rumEvents, getSpecId(req), rumEvent))
    res.send('ok')
  })
  app.get('/rum', (req, res) => send(res, rumEvents[getSpecId(req)]))

  app.post('/monitoring', (req, res) => {
    addSpecEvent(monitoring, getSpecId(req), req.body)
    res.send('ok')
  })
  app.get('/monitoring', (req, res) => send(res, monitoring[getSpecId(req)]))

  app.get('/reset', (req, res) => {
    const specId = getSpecId(req)
    logs[specId] = undefined
    rumEvents[specId] = undefined
    monitoring[specId] = undefined
    res.send('ok')
  })

  app.get('/throw', () => {
    throw new Error('Server error')
  })

  app.get('/ok', (req, res) => {
    if (req.query['timing-allow-origin'] === 'true') {
      res.set('Timing-Allow-Origin', '*')
    }
    setTimeout(() => res.send('ok'), 10)
  })

  app.get('/redirect', (req, res) => {
    res.redirect('ok')
  })

  app.post('/server-log', (req, res) => {
    res.send('ok')
  })
}

function addSpecEvent(type, specId, rawEvent) {
  if (type[specId] === undefined) {
    type[specId] = []
  }
  type[specId].push(JSON.parse(rawEvent))
}

function getSpecId(req) {
  return req.query['spec-id'] || 'unknown'
}

function send(res, data) {
  // add response content to res object for logging
  const content = data || []
  res.body = JSON.stringify(content)
  res.send(content)
}
