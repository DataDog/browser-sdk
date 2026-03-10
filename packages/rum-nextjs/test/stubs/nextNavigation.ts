// Stub for next/navigation used in unit tests.
// The real implementations are always replaced via replaceMockable() in specs.
export function usePathname(): string {
  return ''
}

export function useParams(): Record<string, string> {
  return {}
}
