import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { Observable } from '@datadog/browser-core'
import { monitor, ErrorHandling, generateUUID } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { app, crashReporter } from 'electron'

// eslint-disable-next-line camelcase
import { process_minidump_with_stackwalk } from '../../wasm/minidump'
import type { CollectedRumEvent } from './events'

/**
 * Minidump parsed output structure
 */
interface MinidumpResult {
  status: string
  crash_info: {
    type: string
    address: string
    crashing_thread: number
  }
  system_info: {
    os: string
    cpu: string
    cpu_info: string
  }
  thread_count: number
  threads: Array<{
    thread_index: number
    frame_count: number
    frames: Array<{
      module: string
      function: string
      instruction: string
      module_offset: string
      trust: string
    }>
  }>
  crashing_thread?: {
    thread_index: number
    frames: Array<{
      module: string
      function: string
      instruction: string
      module_offset: string
      trust: string
    }>
  }
  module_count: number
  modules: Array<{
    base_address: string
    code_file: string
    code_identifier: string
    debug_file: string
    debug_identifier: string
    version: string
  }>
}

interface CrashContext {
  sessionId: string
  viewId: string
}

const CRASH_CONTEXT_FILE_NAME = '.dd_context'

let ready = false
const callbacks: Array<() => void> = []

/**
 * Convert minidump parsed result to a RUM error event format
 */
function createCrashErrorEvent(
  minidumpResult: MinidumpResult,
  dumpFileName: string,
  crashTime: number,
  applicationId: string,
  sessionId: string,
  viewId: string
) {
  // Transform threads
  const threads = minidumpResult.threads.map((thread, threadId) => {
    const isCrashed = thread.thread_index === minidumpResult.crash_info.crashing_thread
    const stack = thread.frames
      .map((frame) => {
        const moduleName = frame.module ? path.basename(frame.module) : '???'

        // find module and read the base address
        const address = minidumpResult.modules.find((module) => module.code_file === frame.module)?.base_address
        // offset from hex do decimal
        const offset = parseInt(frame.module_offset, 16)

        return `${threadId}  ${moduleName} ${frame.instruction} ${address} + ${offset}`
      })
      .join('\n')

    return {
      name: `Thread ${thread.thread_index}`,
      crashed: isCrashed,
      stack,
    }
  })

  // Transform modules to binary_images
  const binaryImages = minidumpResult.modules.map((module) => {
    // Extract base address value (remove 0x prefix if present)
    const loadAddress = module.base_address

    // Determine if it's a system library based on path
    const isSystem =
      module.code_file.includes('/System/Library/') ||
      module.code_file.includes('/usr/lib/') ||
      module.code_file.includes('\\Windows\\') ||
      module.code_file.includes('\\System32\\')

    return {
      uuid: module.debug_identifier,
      name: path.basename(module.code_file),
      is_system: isSystem,
      load_address: loadAddress,
      max_address: undefined, // Not provided by minidump parser
      arch: minidumpResult.system_info.cpu,
    }
  })

  // Get the crashed thread for the main stack trace
  const crashedThread = threads.find((t) => t.crashed)

  return {
    _dd: {
      format_version: 2 as const,
    },
    application: { id: applicationId },
    date: crashTime,
    env: 'prod',
    error: {
      binary_images: binaryImages,
      category: 'Exception' as const,
      handling: ErrorHandling.UNHANDLED,
      id: generateUUID(),
      is_crash: true,
      message: `Application crashed (${dumpFileName})`,
      meta: {
        code_type: minidumpResult.system_info.cpu,
        process: app.getName(),
        exception_type: minidumpResult.crash_info.type,
        path: undefined, // Could be extracted from modules
      },
      source: 'source' as const,
      source_type: 'electron' as 'browser',
      stack: crashedThread?.stack,
      threads,
      type: minidumpResult.crash_info.type,
      was_truncated: false,
    },
    service: 'electron-adrian',
    session: { id: sessionId, type: 'user' as const },
    source: 'electron' as 'browser',
    type: RumEventType.ERROR,
    view: { id: viewId, url: 'com/datadog/application-launch/view' },
  }
}

export function startCrashMonitoring(onRumEventObservable: Observable<CollectedRumEvent>, applicationId: string) {
  // Initialize crash reporter
  crashReporter.start({
    uploadToServer: false, // We'll handle uploading via RUM
  })

  // Wait for app to be ready before accessing crash dumps directory
  void app.whenReady().then(
    monitor(async () => {
      const crashesDirectory = app.getPath('crashDumps')

      const crashContextPath = path.join(crashesDirectory, CRASH_CONTEXT_FILE_NAME)

      // Check if crash context file exists
      try {
        await fs.access(crashContextPath)
      } catch {
        console.warn('[Datadog] No crash context found')
        // Stop reporting, we don't want to report incorrect data
        ready = true
        callbacks.forEach((callback) => callback())
        return
      }

      // Read crash context from previous session
      const crashContext = await fs.readFile(crashContextPath, 'utf-8')
      const crashContextData = JSON.parse(crashContext) as CrashContext

      // Check if there are any crash reports pending
      const pendingCrashReports = await getFilesRecursive(crashesDirectory, '.dmp')

      if (pendingCrashReports.length === 0) {
        console.log('[Datadog] No pending crash reports found')
      } else {
        console.log(`[Datadog] ${pendingCrashReports.length} pending crash reports found`)
      }

      // Process crash reports in parallel
      await Promise.all(
        pendingCrashReports.map(async (reportPath) => {
          const reportMetadata = await fs.stat(reportPath)
          const reportBytes = await fs.readFile(reportPath)

          const resultJson = await process_minidump_with_stackwalk(reportBytes)
          const minidumpResult: MinidumpResult = JSON.parse(resultJson)

          const crashTime = new Date(reportMetadata.ctime).getTime()

          const reportName = path.basename(reportPath)
          const rumErrorEvent = createCrashErrorEvent(
            minidumpResult,
            reportName,
            crashTime,
            applicationId,
            crashContextData.sessionId,
            crashContextData.viewId
          )

          onRumEventObservable.notify({
            event: rumErrorEvent,
            source: 'main-process',
          })

          // delete the crash report
          await fs.unlink(reportPath)
          console.log(`[Datadog] crash processed: ${reportName}`)
        })
      )

      ready = true
      callbacks.forEach((callback) => callback())
    })
  )
}

async function getFilesRecursive(dir: string, ext: string) {
  let results: string[] = []

  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      results = results.concat(await getFilesRecursive(fullPath, ext))
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      // Match extension (example: ".txt")
      results.push(fullPath)
    }
  }

  return results
}

export const storeCrashContext = monitor(async (context: { sessionId: string; viewId: string }) => {
  if (!ready) {
    callbacks.push(() => {
      void storeCrashContext(context)
    })
    return
  }

  const crashesDirectory = app.getPath('crashDumps')

  const crashContextPath = path.join(crashesDirectory, CRASH_CONTEXT_FILE_NAME)
  await fs.writeFile(crashContextPath, JSON.stringify(context, null, 2), 'utf-8')
})
