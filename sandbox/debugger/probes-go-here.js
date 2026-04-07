/**
 * The functions in this file have manually been instrumented with the Datadog Live Debugger probes.
 * In reality this would be done by a build step that injects the necessary code into the functions.
 */

function sometimesThrows(a, b) {
  const $dd_p = $dd_probes('probes-go-here.js;sometimesThrows')
  try {
    if ($dd_p) $dd_entry($dd_p, this, { a, b })
    const sum = a + b
    if (Math.random() < 0.2) {
      throw new Error('Sometimes throws')
    }
    return $dd_p ? $dd_return($dd_p, sum, this, { a, b }, { sum }) : sum
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e, this, { a, b })
    throw e
  }
}

function withLocals(a, b) {
  const $dd_p = $dd_probes('probes-go-here.js;withLocals')
  try {
    if ($dd_p) $dd_entry($dd_p, this, { a, b })
    const arr = [a, b, a + b]
    const obj = { a, b, total: arr[2], label: null }
    let label
    if (arr[2] > 10) {
      label = 'big'
    } else {
      label = false
    }
    obj.label = label
    return $dd_p ? $dd_return($dd_p, obj, this, { a, b }, { arr, obj, label }) : obj
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e, this, { a, b })
    throw e
  }
}

function noLocals(a, b) {
  const $dd_p = $dd_probes('probes-go-here.js;noLocals')
  try {
    if ($dd_p) $dd_entry($dd_p, this, { a, b })
    return $dd_p ? $dd_return($dd_p, a * b, this, { a, b }, {}) : a * b
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e, this, { a, b })
    throw e
  }
}

function sometimesSlow() {
  const $dd_p = $dd_probes('probes-go-here.js;sometimesSlow')
  try {
    if ($dd_p) $dd_entry($dd_p, this, {})
    // This function usually runs fast (10ms) but occasionally slow (150-200ms)
    const isSlow = Math.random() < 0.2 // 20% chance to be slow
    const delay = isSlow ? 150 + Math.random() * 50 : 10

    const start = performance.now()
    while (performance.now() - start < delay) {
      // Busy-wait loop to simulate work
    }
    if ($dd_p) $dd_return($dd_p, undefined, this, {}, { isSlow, delay, start })
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e, this, {})
    throw e
  }
}

setInterval(sometimesThrows, 1000, 1, 2)
setInterval(withLocals, 1100, 3, 4)
setInterval(noLocals, 1200, 5, 6)
setInterval(sometimesSlow, 1300)
