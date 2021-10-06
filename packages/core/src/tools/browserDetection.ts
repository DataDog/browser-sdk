export function isIE() {
  return Boolean((document as any).documentMode)
}
