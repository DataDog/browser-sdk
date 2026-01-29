import type http from 'node:http'
import { resolve } from 'path'
import express from 'express'
import { createServer as createViteServer } from 'vite'
import { buildEnvKeys, getBuildEnvValue } from '../../../scripts/lib/buildEnv.ts'

const ROOT = resolve(import.meta.dirname, '../../..')

export async function startServer({
  watch,
  specPattern,
}: {
  watch: boolean
  specPattern: string | undefined
}): Promise<http.Server> {
  console.log('Starting Vite dev server...')

  const viteServer = await createViteServer({
    root: import.meta.dirname,
    server: { middlewareMode: true, watch: watch ? {} : null },
    resolve: {
      alias: [
        { find: /^@datadog\/browser-([^\\/]+)$/, replacement: `${ROOT}/packages/$1/src` },
        { find: /^@datadog\/browser-(.+\/.*)$/, replacement: `${ROOT}/packages/$1` },
        { find: /^packages\/(.*)$/, replacement: `${ROOT}/packages/$1` },
        { find: /^\.\/allJsonSchemas$/, replacement: `${import.meta.dirname}/browser/allJsonSchemas.ts` },
      ],
    },
    define: Object.fromEntries(
      buildEnvKeys.map((key) => [`__BUILD_ENV__${key}__`, JSON.stringify(getBuildEnvValue(key))])
    ),
    plugins: [
      {
        name: 'filter-spec-files',
        load(id) {
          if (specPattern && !id.endsWith('forEach.spec.ts') && id.endsWith('.spec.ts') && !id.includes(specPattern)) {
            return ''
          }
        },
      },
    ],
  })

  const app = express()
  app.use(viteServer.middlewares)

  const httpServer = await new Promise<http.Server>((resolve, reject) => {
    const server = app.listen(8080, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(server)
      }
    })
  })

  console.log('Vite dev server started on http://localhost:8080')

  return httpServer
}
