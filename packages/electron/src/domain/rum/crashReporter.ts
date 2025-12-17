import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { Observable } from '@datadog/browser-core'
import { monitorError, monitor, ErrorHandling, generateUUID } from '@datadog/browser-core'
import type { RumEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { app, crashReporter } from 'electron'
import { process_minidump } from '../../wasm/minidump'
import type { CollectedRumEvent } from './events'
import { NODE_VIEW_NAME } from './mainProcessTracking'

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
    size: number
    version: string
  }>
}

interface CrashContext {
  sessionId: string
  viewId: string
}

const CRASH_CONTEXT_FILE_NAME = '.dd_context'

let pendingCrashReportsProcessed = false
const callbacks: Array<() => void> = []

/**
 * Convert minidump parsed result to a RUM error event format
 */
function createCrashErrorEvent(
  minidumpResult: MinidumpResult,
  dumpFileName: string,
  crashTime: number,
  sessionId: string,
  viewId: string
): RumEvent {
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

    // Calculate max address: base_address (hex) + size (decimal) -> hex
    const maxAddress = module.size ? `0x${(parseInt(loadAddress, 16) + module.size).toString(16)}` : undefined

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
      max_address: maxAddress,
      arch: minidumpResult.system_info.cpu,
    }
  })

  // Get the crashed thread for the main stack trace
  const crashedThread = threads.find((t) => t.crashed)

  return {
    date: crashTime,
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
    session: { id: sessionId, type: 'user' as const },
    type: RumEventType.ERROR,
    view: { id: viewId, url: NODE_VIEW_NAME },
  } as unknown as RumEvent
}

export function startCrashMonitoring(
  onRumEventObservable: Observable<CollectedRumEvent>,
  onAppStable: Observable<void>
) {
  // Initialize crash reporter
  crashReporter.start({
    uploadToServer: false, // We'll handle uploading via RUM
  })

  // TODO:
  // - process files sequentially instead of in parallel to limit impact on resources
  // - consider offloading that to a different thread
  onAppStable.subscribe(() => {
    void processCrashesFiles(onRumEventObservable).catch(monitorError)
  })
}

async function processCrashesFiles(onRumEventObservable: Observable<CollectedRumEvent>) {
  const crashesDirectory = app.getPath('crashDumps')

  const crashContextPath = path.join(crashesDirectory, CRASH_CONTEXT_FILE_NAME)

  // Check if crash context file exists
  let crashContextData: CrashContext
  try {
    await fs.access(crashContextPath)
    // Read crash context from previous session
    const crashContext = await fs.readFile(crashContextPath, 'utf-8')
    crashContextData = JSON.parse(crashContext) as CrashContext
  } catch {
    console.warn('[Datadog] Missing or invalid crash context found at', crashContextPath)
    // Stop reporting, we don't want to report incorrect data
    pendingCrashReportsProcessed = true
    callbacks.forEach((callback) => callback())
    return
  }

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

      const resultJson = await process_minidump(reportBytes, null)
      const minidumpResult: MinidumpResult = JSON.parse(resultJson)

      const crashTime = new Date(reportMetadata.ctime).getTime()

      const reportName = path.basename(reportPath)
      const rumErrorEvent = createCrashErrorEvent(
        minidumpResult,
        reportName,
        crashTime,
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

  pendingCrashReportsProcessed = true
  callbacks.forEach((callback) => callback())
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
  if (!pendingCrashReportsProcessed) {
    callbacks.push(() => {
      void storeCrashContext(context)
    })
    return
  }

  const crashesDirectory = app.getPath('crashDumps')

  const crashContextPath = path.join(crashesDirectory, CRASH_CONTEXT_FILE_NAME)
  await fs.writeFile(crashContextPath, JSON.stringify(context, null, 2), 'utf-8')
})
