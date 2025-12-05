/* tslint:disable */
/* eslint-disable */
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
 * Initialize panic hook for better error messages in WASM
 */
export function init(): void;
/**
 * Process a minidump with stack walking and optional symbol resolution
 *
 * This is the main entry point for analyzing minidump files in WebAssembly.
 *
 * # Arguments
 * * `dump_bytes` - The minidump file as a byte array
 * * `symbol_urls` - Optional array of symbol server URLs (currently not supported)
 *
 * # Returns
 * A Promise that resolves to a JSON string containing complete crash analysis
 *
 * # Symbol URL Limitation
 * **IMPORTANT:** Symbol URLs are currently not supported in WASM builds.
 * The parameter is accepted for API stability, but symbols will not be fetched.
 *
 * # Example (JavaScript)
 * ```js
 * const { process_minidump } = require('minidump');
 * const result = await process_minidump(dumpBytes, null);
 * const analysis = JSON.parse(result);
 * console.log('Crash:', analysis.crash_info.type);
 * ```
 */
export function process_minidump(dump_bytes: Uint8Array, symbol_urls?: string[] | null): Promise<any>;
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
