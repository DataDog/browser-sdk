import { useState, useEffect } from 'react'
import { fetchDataWithDelay } from '../utils/api'

interface UseDataResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

/**
 * Custom hook to fetch data from JSON files
 */
export function useData<T>(url: string, delayMs: number = 300): UseDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        setLoading(true)
        const result = await fetchDataWithDelay<T>(url, delayMs)
        if (mounted) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'))
          setData(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, [url, delayMs])

  return { data, loading, error }
}
