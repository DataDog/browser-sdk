'use client'

import { useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProtectedPage() {
  const router = useRouter()

  useLayoutEffect(() => {
    router.replace('/login')
  }, [router])

  return <h1>Protected</h1>
}
