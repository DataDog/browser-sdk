const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const path = require('path')

const { specContexts } = require('./spec-contexts')
const { logging } = require('./logging')
const fakeBackend = require('./fake-backend')

const port = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(specContexts)
app.use(logging)
app.use(express.static(path.join(__dirname, '../static')))
app.use(express.static(path.join(__dirname, '../app/dist')))
app.use(express.static(path.join(__dirname, '../../packages/logs/bundle')))
app.use(express.static(path.join(__dirname, '../../packages/rum/bundle')))
app.use(bodyParser.text())
fakeBackend(app)

app.listen(port, () => console.log(`server listening on port ${port}.`))
