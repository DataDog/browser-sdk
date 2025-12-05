export async function fetchCdnBundle(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  try {
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Failed to fetch CDN bundle: ${response.status} ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('CDN bundle fetch timed out after 10 seconds')
      }
      // Retry once after 1 second delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      try {
        const retryResponse = await fetch(url)
        if (!retryResponse.ok) {
          throw new Error(`Failed to fetch CDN bundle on retry: ${retryResponse.status}`)
        }
        return await retryResponse.text()
      } catch (retryError) {
        throw new Error(`Failed to fetch CDN bundle after retry: ${error.message}`)
      }
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
