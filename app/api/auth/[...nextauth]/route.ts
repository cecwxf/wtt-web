import NextAuth, { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import TwitterProvider from "next-auth/providers/twitter"
import CredentialsProvider from "next-auth/providers/credentials"
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth"

const WTT_API_URL =
  process.env.WTT_API_URL ||
  process.env.NEXT_PUBLIC_WTT_API_URL ||
  'http://170.106.109.4:8000'

const ENABLE_TEST_LOGIN = process.env.ENABLE_TEST_LOGIN === 'true'
const TEST_ADMIN_IDENTIFIER = process.env.TEST_ADMIN_IDENTIFIER || 'test-admin'
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test-admin-pass'

interface WeChatProfile {
  openid: string
  unionid?: string
  nickname: string
  headimgurl: string
  sex: number
  province: string
  city: string
  country: string
}

function WeChatProvider(
  options: OAuthUserConfig<WeChatProfile>
): OAuthConfig<WeChatProfile> {
  const appId = options.clientId
  const appSecret = options.clientSecret

  if (!appId || !appSecret) {
    console.warn("WeChat OAuth: WECHAT_APP_ID or WECHAT_APP_SECRET is not set. WeChat login will not work.")
  }

  return {
    id: "wechat",
    name: "WeChat",
    type: "oauth",
    checks: ["state"],
    clientId: appId ?? "",
    clientSecret: appSecret ?? "",
    authorization: {
      url: "https://open.weixin.qq.com/connect/qrconnect",
      params: {
        appid: appId ?? "",
        scope: "snsapi_login",
        response_type: "code",
      },
    },
    token: {
      url: "https://api.weixin.qq.com/sns/oauth2/access_token",
      async request({ params }) {
        const url = new URL(
          "https://api.weixin.qq.com/sns/oauth2/access_token"
        )
        url.searchParams.set("appid", appId ?? "")
        url.searchParams.set("secret", appSecret ?? "")
        url.searchParams.set("code", params.code as string)
        url.searchParams.set("grant_type", "authorization_code")

        const response = await fetch(url.toString())
        const tokens = await response.json()
        if (tokens.errcode) {
          throw new Error(`WeChat token error: ${tokens.errcode} - ${tokens.errmsg}`)
        }
        return { tokens }
      },
    },
    userinfo: {
      url: "https://api.weixin.qq.com/sns/userinfo",
      async request({ tokens }) {
        const url = new URL("https://api.weixin.qq.com/sns/userinfo")
        url.searchParams.set("access_token", tokens.access_token as string)
        url.searchParams.set("openid", (tokens as Record<string, unknown>).openid as string)
        url.searchParams.set("lang", "zh_CN")

        const response = await fetch(url.toString())
        const profile = await response.json()
        if (profile.errcode) {
          throw new Error(`WeChat userinfo error: ${profile.errcode} - ${profile.errmsg}`)
        }
        return profile
      },
    },
    profile(profile: WeChatProfile) {
      return {
        id: profile.unionid || profile.openid,
        name: profile.nickname,
        email: null,
        image: profile.headimgurl,
      }
    },
    style: {
      logo: "https://authjs.dev/img/providers/wechat.svg",
      bg: "#07C160",
      text: "#fff",
    },
    options,
  }
}

const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
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
    WeChatProvider({
      clientId: process.env.WECHAT_APP_ID!,
      clientSecret: process.env.WECHAT_APP_SECRET!,
    }),
    CredentialsProvider({
      name: "Phone OTP",
      credentials: {
        identifier: { label: "Phone", type: "text" },
        code: { label: "Code", type: "text" },
        displayName: { label: "Display Name", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier) {
          return null
        }

        if (
          ENABLE_TEST_LOGIN &&
          credentials.identifier === TEST_ADMIN_IDENTIFIER &&
          credentials.password === TEST_ADMIN_PASSWORD
        ) {
          return {
            id: 'test-admin',
            email: 'test-admin@local',
            name: 'Test Admin',
            accessToken: `test-admin-token-${Date.now()}`,
          }
        }

        try {
          const useCodeFlow = Boolean(credentials.code)
          const response = await fetch(
            useCodeFlow ? `${WTT_API_URL}/auth/phone/login` : `${WTT_API_URL}/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                useCodeFlow
                  ? {
                      phone: credentials.identifier,
                      code: credentials.code,
                      display_name: credentials.displayName,
                    }
                  : {
                      email: credentials.identifier,
                      password: credentials.password,
                    }
              ),
            }
          )

          if (!response.ok) {
            return null
          }

          const data = await response.json()

          return {
            id: data.user_id,
            email: data.email ?? null,
            name: data.display_name,
            accessToken: data.access_token ?? data.token,
          }
        } catch (error) {
          console.error("Login error:", error)
          return null
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
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.userId = token.userId as string
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
