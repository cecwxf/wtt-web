import NextAuth, { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import TwitterProvider from "next-auth/providers/twitter"
import CredentialsProvider from "next-auth/providers/credentials"

const WTT_API_URL =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  'http://170.106.109.4:8000'

const ENABLE_TEST_LOGIN = process.env.ENABLE_TEST_LOGIN === 'true'
const TEST_ADMIN_IDENTIFIER = process.env.TEST_ADMIN_IDENTIFIER || 'test-admin'
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test-admin-pass'

const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: 'read:user user:email repo' } },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
    }),
    CredentialsProvider({
      name: "Email Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const record = credentials as Record<string, string | undefined>
        const authType = (record?.authType || 'email_password').trim()
        const email = (credentials?.email ?? record?.identifier ?? '').trim().toLowerCase()
        const phone = (record?.phone || record?.identifier || '').trim()
        const code = (record?.code || '').trim()
        const password = credentials?.password ?? ''

        if (authType === 'email_password' && (!email || !password)) {
          return null
        }
        if (authType === 'phone_password' && (!phone || !password)) {
          return null
        }
        if (authType === 'phone_code' && (!phone || !code)) {
          return null
        }

        if (
          ENABLE_TEST_LOGIN &&
          email === TEST_ADMIN_IDENTIFIER &&
          password === TEST_ADMIN_PASSWORD
        ) {
          return {
            id: 'test-admin',
            email: 'test-admin@local',
            name: 'Test Admin',
            accessToken: `test-admin-token-${Date.now()}`,
          }
        }

        try {
          const endpoint = authType === 'phone_code'
            ? '/auth/phone/login'
            : authType === 'phone_password'
              ? '/auth/phone/password-login'
              : '/auth/login'
          const body = authType === 'phone_code'
            ? { phone, code }
            : authType === 'phone_password'
              ? { phone, password }
              : { email, password }
          const response = await fetch(`${WTT_API_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

          if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            if (response.status === 403 && err?.detail === 'EMAIL_NOT_VERIFIED') {
              throw new Error('EMAIL_NOT_VERIFIED')
            }
            return null
          }

          const data = await response.json()

          return {
            id: data.user_id,
            email: data.email ?? null,
            phone: data.phone ?? null,
            name: data.display_name,
            accessToken: data.access_token ?? data.token,
          }
        } catch (error) {
          console.error("Login error:", error)
          throw error
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") {
        // OAuth 登录，调用后端 OAuth 回调
        try {
          const oauthToken = account?.access_token ?? account?.id_token
          if (!oauthToken) {
            console.error("OAuth callback error: missing oauth token from provider")
            return false
          }

          // Preserve the original GitHub OAuth token for direct GitHub API calls
          if (account?.provider === 'github' && account?.access_token) {
            ;(user as unknown as Record<string, unknown>).githubToken = account.access_token
          }

          const response = await fetch(`${WTT_API_URL}/auth/oauth/callback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: oauthToken,
              provider: account?.provider,
            }),
          })

          if (response.ok) {
            const data = await response.json()
            user.accessToken = data.access_token
            user.id = data.user?.id ?? data.user_id ?? user.id
          } else {
            const err = await response.text()
            console.error("OAuth callback error:", err)
            return false
          }
        } catch (error) {
          console.error("OAuth callback error:", error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken
        token.userId = user.id
        token.userName = (user.name as string | undefined) || (user.email as string | undefined) || `user_${String(user.id || '').slice(0, 8)}`
        if ((user as unknown as Record<string, unknown>).githubToken) {
          token.githubToken = (user as unknown as Record<string, unknown>).githubToken
        }
      }
      if (!token.userName && token.userId) {
        token.userName = `user_${String(token.userId).slice(0, 8)}`
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.userId = token.userId as string
      if (token.githubToken) {
        ;(session as unknown as Record<string, unknown>).githubToken = token.githubToken
      }
      if (!session.user) session.user = { name: undefined, email: undefined } as typeof session.user
      if (!session.user.name) {
        session.user.name = (token.userName as string | undefined) || `user_${String(token.userId || '').slice(0, 8)}`
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
