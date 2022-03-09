import express from 'express'
import esbuild from 'esbuild'
import { printLog } from './utils.js'
import { bundle } from './build/build.mjs'

// Note: Ideally, we would use `esbuild.serve` instead of an express app. But there is a known issue
// where `onEnd` plugin callbacks are not invoked when serving. See
// https://github.com/evanw/esbuild/issues/1384

const port = 8080
const app = express()
const bundles = new Map()

app.use(express.static('sandbox'))
app.use(serveBundles)

app.listen(port, () => printLog(`Server listening on port ${port}.`))

function serveBundles(req, res, next) {
  const matches = /^\/datadog-(rum|rum-slim|logs).*\.js(\.map)?$/.exec(req.path)
  if (!matches) {
    next()
    return
  }

  const bundleName = matches[1]
  const isMap = matches[2] !== undefined

  getBundle(bundleName).then(
    (bundle) => {
      if (isMap) {
        const file = bundle.outputFiles.find((file) => file.path.endsWith('.js.map'))
        res.type('application/json').send(Buffer.from(file.contents))
      } else {
        const file = bundle.outputFiles.find((file) => file.path.endsWith('.js'))
        res.type('text/javascript').send(Buffer.from(file.contents))
      }
    },
    (error) => {
      if (isMap) {
        res.status(500)
      } else {
        const errorMessage = `Failed to build ${bundleName} bundle: ${error.message}`
        res.type('text/javascript').send(`console.error(${JSON.stringify(errorMessage)})`)
      }
    }
  )
}

function getBundle(name) {
  if (!bundles.has(name)) {
    bundles.set(
      name,
      bundle({
        entryPoints: {
          [`datadog-${name}`]: `packages/${name}/src/entries/main.ts`,
        },
        sourcemap: true,
        watch: {
          onRebuild(error, result) {
            let promise = error ? Promise.reject(error) : Promise.resolve(result)
            bundles.set(name, promise)

            // Make sure our rejected promise does not stop the node process because of "unhandled
            // rejection"
            void promise.catch(() => {
              // noop
            })
          },
        },
        outdir: '.', // nothing will be actually written there
      }).catch(() => {
        // There is a known issue where `onRebuild` is never called when the initial build fails
        // (see https://github.com/evanw/esbuild/pull/1835), so in this case just exit the process
        // as it won't recover.
        process.exit(1)
      })
    )
  }

  return bundles.get(name)
}
