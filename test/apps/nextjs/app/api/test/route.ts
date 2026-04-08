import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: Date.now() })
}

export async function POST(request: Request) {
  const body = await request.json()
  return NextResponse.json({ echo: body })
}
