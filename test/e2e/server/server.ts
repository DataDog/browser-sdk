import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as express from 'express'
import * as path from 'path'

const app = express()
const port = 3000

app.use(express.static(path.join(__dirname, '../static')))
app.use(express.static(path.join(__dirname, '../../../dist')))
app.use(bodyParser.text())
app.use(cors())

let logs: object[] = []

app.post('/logs', (req, res) => {
  req.body.split('\n').forEach((log: string) => logs.push(JSON.parse(log)))
  res.send('ok')
})
app.get('/logs', (req, res) => res.send(logs))

let rumEvents: object[] = []

app.post('/rum', (req, res) => {
  req.body.split('\n').forEach((rumEvent: string) => rumEvents.push(JSON.parse(rumEvent)))
  res.send('ok')
})
app.get('/rum', (req, res) => res.send(rumEvents))

let monitoring: object[] = []

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

app.listen(port, () => console.log(`e2e server listening on port ${port}.`))
