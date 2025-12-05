import { createServer } from '../domain/server.ts'

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
const HOST = process.env.HOST || '0.0.0.0'

const server = createServer()

server.listen(PORT, HOST, () => {
  console.log(`[SSI] Server listening on http://${HOST}:${PORT}`)
  console.log(`[SSI] Usage: http://${HOST}:${PORT}/ssi?id=<config-id>`)
  console.log(`[SSI] Health check: http://${HOST}:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SSI] SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('[SSI] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('[SSI] SIGINT received, shutting down gracefully')
  server.close(() => {
    console.log('[SSI] Server closed')
    process.exit(0)
  })
})
