import { fetchHandlingError } from './executionUtils.ts'

interface BrowserStackRequestOptions extends RequestInit {
  headers?: Record<string, string>
}

export async function browserStackRequest(url: string, options: BrowserStackRequestOptions = {}): Promise<any> {
  const response = await fetchHandlingError(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}`).toString('base64')}`,
    },
    ...options,
  })
  return response.json()
}
