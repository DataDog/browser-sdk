import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { Transform } from 'node:stream'
import { parseArgs } from 'node:util'
import { printWarning } from '../../../lib/executionUtils.ts'
import { LOG_FILE } from '../state.ts'

export function logs(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { follow: { type: 'boolean', short: 'f' } },
  })

  if (!fs.existsSync(LOG_FILE)) {
    printWarning('No dev server logs found.')
    return
  }

  let stream: NodeJS.ReadableStream

  if (values.follow) {
    const tail = spawn('tail', ['-f', LOG_FILE], { stdio: ['ignore', 'pipe', 'inherit'] })
    stream = tail.stdout
  } else {
    stream = fs.createReadStream(LOG_FILE)
  }

  if (!process.stdout.isTTY) {
    stream = stream.pipe(stripAnsi())
  }
  stream.pipe(process.stdout)
}

function stripAnsi(): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      // eslint-disable-next-line no-control-regex
      callback(null, chunk.toString().replace(/\x1B\[[\d;]*[A-Za-z]/g, ''))
    },
  })
}
