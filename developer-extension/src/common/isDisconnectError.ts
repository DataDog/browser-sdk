export function isDisconnectError(error: unknown) {
  return (
    typeof error === 'object' && error && (error as { message?: string }).message === 'Extension context invalidated.'
  )
}
