const { clean } = require('./spec-contexts')

module.exports = (app) => {
  app.post('/logs', (req, res) => {
    req.body.split('\n').forEach((log) => req.specContext.logs.push(JSON.parse(log)))
    res.send('ok')
  })
  app.get('/logs', (req, res) => send(res, req.specContext.logs))

  app.post('/rum', (req, res) => {
    req.body.split('\n').forEach((rumEvent) => req.specContext.rum.push(JSON.parse(rumEvent)))
    res.send('ok')
  })
  app.get('/rum', (req, res) => send(res, req.specContext.rum))

  app.post('/monitoring', (req, res) => {
    req.specContext.monitoring.push(JSON.parse(req.body))
    res.send('ok')
  })
  app.get('/monitoring', (req, res) => send(res, req.specContext.monitoring))

  app.get('/reset', (req, res) => {
    clean(req.specContext)
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

function send(res, data) {
  // add response content to res object for logging
  const content = data || []
  res.body = JSON.stringify(content)
  res.send(content)
}
