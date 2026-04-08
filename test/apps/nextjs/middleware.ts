import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function middleware(request: NextRequest) {
  const response = NextResponse.next()
  // Add a custom header so E2E tests can verify middleware ran
  response.headers.set('x-dd-middleware', 'true')
  return response
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
