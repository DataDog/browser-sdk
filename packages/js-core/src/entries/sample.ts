/**
 * Performs a weighted random draw, typically used to decide whether an event should be sampled
 * (e.g. included in a telemetry payload).
 *
 * @param threshold - The probability of success, as a percentage between `0` and `100`.
 * @returns `true` if the draw succeeds, `false` otherwise. Always `false` when `threshold` is `0`.
 */
export function performDraw(threshold: number): boolean {
  return threshold !== 0 && Math.random() * 100 <= threshold
}
