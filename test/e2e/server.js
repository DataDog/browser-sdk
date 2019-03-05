const bodyParser = require('body-parser')
const express = require('express')
const path = require('path')
const app = express()
const port = 3000

app.use(express.static(path.join(__dirname, 'static')))
app.use(express.static(path.join(__dirname, '../../dist')))
app.use(bodyParser.text())

let logs = []

app.post('/logs', (req, res) => {
  req.body.split('\n').forEach((log) => logs.push(JSON.parse(log)))
  res.send('ok')
})
app.get('/logs', (req, res) => res.send(logs))

let monitoring = []

app.post('/monitoring', (req, res) => {
  monitoring.push(JSON.parse(req.body))
  res.send('ok')
})
app.get('/monitoring', (req, res) => res.send(monitoring))

app.post('/reset', (req, res) => {
  logs = []
  monitoring = []
  res.send('ok')
})

app.listen(port, () => console.log(`e2e server listening on port ${port}.`))
