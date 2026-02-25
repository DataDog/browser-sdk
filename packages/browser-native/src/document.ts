/** Returns the current value of document.cookie (all cookies as a single string). */
export function getCookie(): string {
  return document.cookie
}

/** Sets a cookie by assigning to document.cookie. */
export function setCookie(value: string): void {
  document.cookie = value
}

/** Returns document.readyState. */
export function getReadyState(): DocumentReadyState {
  return document.readyState
}

/** Returns document.visibilityState. */
export function getVisibilityState(): DocumentVisibilityState {
  return document.visibilityState
}
