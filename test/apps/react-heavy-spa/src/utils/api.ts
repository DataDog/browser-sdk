/**
 * Fetch data from static JSON files
 */
async function fetchData<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Simulate API delay for more realistic behavior
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch data with simulated delay
 */
export async function fetchDataWithDelay<T>(path: string, delayMs: number = 300): Promise<T> {
  await delay(delayMs)
  return fetchData<T>(path)
}
