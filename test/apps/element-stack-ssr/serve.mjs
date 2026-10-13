import { spawn } from 'node:child_process'

const children = [
  ['next', ['dev']],
  ['nuxt', ['dev']],
  ['angular', ['start']],
].map(([framework, args]) =>
  spawn('yarn', args, { cwd: new URL(`./${framework}/`, import.meta.url), stdio: 'inherit' })
)
function stop() {
  for (const child of children) child.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
console.log('Next: http://127.0.0.1:3101 | Nuxt: http://127.0.0.1:3102 | Angular: http://127.0.0.1:3103')
