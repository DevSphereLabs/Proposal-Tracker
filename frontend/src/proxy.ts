import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth isn't wired up yet. Flip this to true once the backend issues real
// auth_token cookies, so the client portal stays reachable in the meantime.
const AUTH_ENABLED = false

export function proxy(request: NextRequest) {
  const token = request.cookies.get('auth_token')

  if (AUTH_ENABLED && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/team/:path*'],
}
