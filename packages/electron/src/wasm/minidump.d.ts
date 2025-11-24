/* tslint:disable */
/* eslint-disable */
/**
 * Initialize panic hook for better error messages in WASM
 */
export function init(): void;
/**
 * Parse a minidump from raw bytes and return basic information as JSON
 *
 * # Arguments
 * * `dump_bytes` - The minidump file as a byte array
 *
 * # Returns
 * A JSON string containing basic minidump information (system info, exception, threads, modules)
 *
 * # Example (JavaScript)
 * ```js
 * const fs = require('fs');
 * const { parse_minidump } = require('./minidump_wasm');
 *
 * const dumpBytes = fs.readFileSync('crash.dmp');
 * const result = parse_minidump(dumpBytes);
 * const json = JSON.parse(result);
 * console.log('OS:', json.system_info.os);
 * console.log('Crash reason:', json.exception.crash_reason);
 * ```
 */
export function parse_minidump(dump_bytes: Uint8Array): string;
/**
 * Process a minidump with full stack walking (returns a Promise)
 *
 * # Arguments
 * * `dump_bytes` - The minidump file as a byte array
 *
 * # Returns
 * A Promise that resolves to a JSON string containing full crash analysis with stack traces
 *
 * # Example (JavaScript)
 * ```js
 * const fs = require('fs');
 * const { process_minidump_with_stackwalk } = require('./minidump_wasm');
 *
 * const dumpBytes = fs.readFileSync('crash.dmp');
 * const result = await process_minidump_with_stackwalk(dumpBytes);
 * const json = JSON.parse(result);
 *
 * // Access crashing thread's stack trace
 * json.crashing_thread.frames.forEach((frame, i) => {
 *     console.log(`Frame ${i}: ${frame.module || '?'} + ${frame.offset}`);
 * });
 * ```
 */
export function process_minidump_with_stackwalk(dump_bytes: Uint8Array): Promise<any>;
