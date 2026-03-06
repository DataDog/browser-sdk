import { execSync } from 'child_process'

// eslint-disable-next-line import/no-default-export
export default function globalTeardown() {
  console.log('Shutting down Android emulator...')
  try {
    execSync('adb emu kill', { timeout: 10_000 })
    console.log('Emulator stopped')
  } catch {
    console.warn('Failed to stop emulator (it may have already exited)')
  }
}
