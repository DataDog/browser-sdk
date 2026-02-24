/**
 * Type contract for Next.js `useParams()` return value.
 * Each entry can be a single string (dynamic segment), a string array (catch-all segment),
 * or undefined (optional catch-all with no match).
 */
export type NextParams = Record<string, string | string[] | undefined>
