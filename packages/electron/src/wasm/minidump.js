let imports = {}
imports['__wbindgen_placeholder__'] = module.exports

let cachedUint8ArrayMemory0 = null

function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)
  }
  return cachedUint8ArrayMemory0
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })

cachedTextDecoder.decode()

function decodeText(ptr, len) {
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len))
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0
  return decodeText(ptr, len)
}

function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc()
  wasm.__wbindgen_externrefs.set(idx, obj)
  return idx
}

function handleError(f, args) {
  try {
    return f.apply(this, args)
  } catch (e) {
    const idx = addToExternrefTable0(e)
    wasm.__wbindgen_exn_store(idx)
  }
}

let WASM_VECTOR_LEN = 0

const cachedTextEncoder = new TextEncoder()

if (!('encodeInto' in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg)
    view.set(buf)
    return {
      read: arg.length,
      written: buf.length,
    }
  }
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg)
    const ptr = malloc(buf.length, 1) >>> 0
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf)
    WASM_VECTOR_LEN = buf.length
    return ptr
  }

  let len = arg.length
  let ptr = malloc(len, 1) >>> 0

  const mem = getUint8ArrayMemory0()

  let offset = 0

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset)
    if (code > 0x7f) {
      break
    }
    mem[ptr + offset] = code
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset)
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len)
    const ret = cachedTextEncoder.encodeInto(arg, view)

    offset += ret.written
    ptr = realloc(ptr, len, offset, 1) >>> 0
  }

  WASM_VECTOR_LEN = offset
  return ptr
}

let cachedDataViewMemory0 = null

function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer)
  }
  return cachedDataViewMemory0
}

function isLikeNone(x) {
  return x === undefined || x === null
}

const CLOSURE_DTORS =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((state) => state.dtor(state.a, state.b))

function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor }
  const real = (...args) => {
    // First up with a closure we increment the internal reference
    // count. This ensures that the Rust closure environment won't
    // be deallocated while we're invoking it.
    state.cnt++
    const a = state.a
    state.a = 0
    try {
      return f(a, state.b, ...args)
    } finally {
      state.a = a
      real._wbg_cb_unref()
    }
  }
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b)
      state.a = 0
      CLOSURE_DTORS.unregister(state)
    }
  }
  CLOSURE_DTORS.register(real, state, state)
  return real
}
/**
 * Initialize panic hook for better error messages in WASM
 */
exports.init = function () {
  wasm.init()
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0
  getUint8ArrayMemory0().set(arg, ptr / 1)
  WASM_VECTOR_LEN = arg.length
  return ptr
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx)
  wasm.__externref_table_dealloc(idx)
  return value
}
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
 * const { parse_minidump } = require('./minidump');
 *
 * const dumpBytes = fs.readFileSync('crash.dmp');
 * const result = parse_minidump(dumpBytes);
 * const json = JSON.parse(result);
 * console.log('OS:', json.system_info.os);
 * console.log('Crash reason:', json.exception.crash_reason);
 * ```
 *
 * @param {Uint8Array} dump_bytes
 * @returns {string}
 */
exports.parse_minidump = function (dump_bytes) {
  let deferred3_0
  let deferred3_1
  try {
    const ptr0 = passArray8ToWasm0(dump_bytes, wasm.__wbindgen_malloc)
    const len0 = WASM_VECTOR_LEN
    const ret = wasm.parse_minidump(ptr0, len0)
    var ptr2 = ret[0]
    var len2 = ret[1]
    if (ret[3]) {
      ptr2 = 0
      len2 = 0
      throw takeFromExternrefTable0(ret[2])
    }
    deferred3_0 = ptr2
    deferred3_1 = len2
    return getStringFromWasm0(ptr2, len2)
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1)
  }
}

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
 * const { process_minidump_with_stackwalk } = require('./minidump');
 *
 * const dumpBytes = fs.readFileSync('crash.dmp');
 * const result = await process_minidump_with_stackwalk(dumpBytes);
 * const json = JSON.parse(result);
 *
 * // Access crashing thread's stack trace
 * json.crashing_thread.frames.forEach((frame, i) => {
 * console.log(`Frame ${i}: ${frame.module || '?'} + ${frame.offset}`);
 * });
 * ```
 *
 * @param {Uint8Array} dump_bytes
 * @returns {Promise<any>}
 */
exports.process_minidump_with_stackwalk = function (dump_bytes) {
  const ptr0 = passArray8ToWasm0(dump_bytes, wasm.__wbindgen_malloc)
  const len0 = WASM_VECTOR_LEN
  const ret = wasm.process_minidump_with_stackwalk(ptr0, len0)
  return ret
}

function wasm_bindgen__convert__closures_____invoke__hbd2252a5ae7d61cd(arg0, arg1, arg2) {
  wasm.wasm_bindgen__convert__closures_____invoke__hbd2252a5ae7d61cd(arg0, arg1, arg2)
}

function wasm_bindgen__convert__closures_____invoke__h2fe7d57d144c8924(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures_____invoke__h2fe7d57d144c8924(arg0, arg1, arg2, arg3)
}

exports.__wbg___wbindgen_is_function_ee8a6c5833c90377 = function (arg0) {
  const ret = typeof arg0 === 'function'
  return ret
}

exports.__wbg___wbindgen_is_undefined_2d472862bd29a478 = function (arg0) {
  const ret = arg0 === undefined
  return ret
}

exports.__wbg___wbindgen_throw_b855445ff6a94295 = function (arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1))
}

exports.__wbg__wbg_cb_unref_2454a539ea5790d9 = function (arg0) {
  arg0._wbg_cb_unref()
}

exports.__wbg_call_525440f72fbfc0ea = function () {
  return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2)
    return ret
  }, arguments)
}

exports.__wbg_call_e762c39fa8ea36bf = function () {
  return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1)
    return ret
  }, arguments)
}

exports.__wbg_error_7534b8e9a36f1ab4 = function (arg0, arg1) {
  let deferred0_0
  let deferred0_1
  try {
    deferred0_0 = arg0
    deferred0_1 = arg1
    console.error(getStringFromWasm0(arg0, arg1))
  } finally {
    wasm.__wbindgen_free(deferred0_0, deferred0_1, 1)
  }
}

exports.__wbg_new_3c3d849046688a66 = function (arg0, arg1) {
  try {
    var state0 = { a: arg0, b: arg1 }
    var cb0 = (arg0, arg1) => {
      const a = state0.a
      state0.a = 0
      try {
        return wasm_bindgen__convert__closures_____invoke__h2fe7d57d144c8924(a, state0.b, arg0, arg1)
      } finally {
        state0.a = a
      }
    }
    const ret = new Promise(cb0)
    return ret
  } finally {
    state0.a = state0.b = 0
  }
}

exports.__wbg_new_8a6f238a6ece86ea = function () {
  const ret = new Error()
  return ret
}

exports.__wbg_new_no_args_ee98eee5275000a4 = function (arg0, arg1) {
  const ret = new Function(getStringFromWasm0(arg0, arg1))
  return ret
}

exports.__wbg_queueMicrotask_34d692c25c47d05b = function (arg0) {
  const ret = arg0.queueMicrotask
  return ret
}

exports.__wbg_queueMicrotask_9d76cacb20c84d58 = function (arg0) {
  queueMicrotask(arg0)
}

exports.__wbg_resolve_caf97c30b83f7053 = function (arg0) {
  const ret = Promise.resolve(arg0)
  return ret
}

exports.__wbg_stack_0ed75d68575b0f3c = function (arg0, arg1) {
  const ret = arg1.stack
  const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
  const len1 = WASM_VECTOR_LEN
  getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true)
  getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true)
}

exports.__wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e = function () {
  const ret = typeof global === 'undefined' ? null : global
  return isLikeNone(ret) ? 0 : addToExternrefTable0(ret)
}

exports.__wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac = function () {
  const ret = typeof globalThis === 'undefined' ? null : globalThis
  return isLikeNone(ret) ? 0 : addToExternrefTable0(ret)
}

exports.__wbg_static_accessor_SELF_6fdf4b64710cc91b = function () {
  const ret = typeof self === 'undefined' ? null : self
  return isLikeNone(ret) ? 0 : addToExternrefTable0(ret)
}

exports.__wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2 = function () {
  const ret = typeof window === 'undefined' ? null : window
  return isLikeNone(ret) ? 0 : addToExternrefTable0(ret)
}

exports.__wbg_then_4f46f6544e6b4a28 = function (arg0, arg1) {
  const ret = arg0.then(arg1)
  return ret
}

exports.__wbindgen_cast_2241b6af4c4b2941 = function (arg0, arg1) {
  // Cast intrinsic for `Ref(String) -> Externref`.
  const ret = getStringFromWasm0(arg0, arg1)
  return ret
}

exports.__wbindgen_cast_29d5b4f96fd1dba2 = function (arg0, arg1) {
  // Cast intrinsic for `Closure(Closure { dtor_idx: 399, function: Function { arguments: [Externref], shim_idx: 400, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
  const ret = makeMutClosure(
    arg0,
    arg1,
    wasm.wasm_bindgen__closure__destroy__h75e0120a17cf8b85,
    wasm_bindgen__convert__closures_____invoke__hbd2252a5ae7d61cd
  )
  return ret
}

exports.__wbindgen_init_externref_table = function () {
  const table = wasm.__wbindgen_externrefs
  const offset = table.grow(4)
  table.set(0, undefined)
  table.set(offset + 0, undefined)
  table.set(offset + 1, null)
  table.set(offset + 2, true)
  table.set(offset + 3, false)
}

// Load WASM from base64-encoded string embedded in the code
const { MINIDUMP_WASM_BASE64 } = require('./minidump_bg.wasm.base64')
// Decode base64 to binary
const wasmBytes = Buffer.from(MINIDUMP_WASM_BASE64, 'base64')
const wasmModule = new WebAssembly.Module(wasmBytes)
const wasm = (exports.__wasm = new WebAssembly.Instance(wasmModule, imports).exports)

wasm.__wbindgen_start()
