module.exports = (app) => {
  let logs = []
  let rumEvents = []
  let monitoring = []

  app.post('/logs', (req, res) => {
    req.body.split('\n').forEach((log) => logs.push(JSON.parse(log)))
    res.send('ok')
  })
  app.get('/logs', (req, res) => send(res, logs))

  app.post('/rum', (req, res) => {
    req.body.split('\n').forEach((rumEvent) => rumEvents.push(JSON.parse(rumEvent)))
    res.send('ok')
  })
  app.get('/rum', (req, res) => send(res, rumEvents))

  app.post('/monitoring', (req, res) => {
    monitoring.push(JSON.parse(req.body))
    res.send('ok')
  })
  app.get('/monitoring', (req, res) => send(res, monitoring))

  app.get('/reset', (req, res) => {
    logs = []
    rumEvents = []
    monitoring = []
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
}

function send(res, data) {
  // add response content to res object for logging
  res.body = JSON.stringify(data)
  res.send(data)
}
