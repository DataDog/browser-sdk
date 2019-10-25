module.exports = (app) => {
  let logs = []
  let rumEvents = []
  let monitoring = []

  app.post('/logs', (req, res) => {
    req.body.split('\n').forEach((log) => logs.push(JSON.parse(log)))
    res.send('ok')
  })
  app.get('/logs', (req, res) => res.send(logs))

  app.post('/rum', (req, res) => {
    req.body.split('\n').forEach((rumEvent) => rumEvents.push(JSON.parse(rumEvent)))
    res.send('ok')
  })
  app.get('/rum', (req, res) => res.send(rumEvents))

  app.post('/monitoring', (req, res) => {
    monitoring.push(JSON.parse(req.body))
    res.send('ok')
  })
  app.get('/monitoring', (req, res) => res.send(monitoring))

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
    res.send('ok')
  })
}
