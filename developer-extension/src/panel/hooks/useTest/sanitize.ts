export function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '-')
}
