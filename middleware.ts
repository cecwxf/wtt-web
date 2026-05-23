import { withAuth } from 'next-auth/middleware'
import { NEXT_AUTH_SECRET } from '@/lib/auth/next-auth-secret'

export default withAuth({
  secret: NEXT_AUTH_SECRET,
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: ['/arena/:path*'],
}
