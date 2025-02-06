export function generateAnonymousId() {
  return Math.floor(Math.random() * Math.pow(36, 10))
    .toString(36)
    .padStart(10, '0')
}
