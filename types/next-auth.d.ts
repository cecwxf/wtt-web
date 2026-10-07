import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    mobileWebSessionId?: string
    accessTokenExpiresAt?: number
    accessToken?: string
    accessTokenRefreshError?: string
    userId?: string
    user: {
      id?: string
    } & DefaultSession["user"]
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    accessTokenExpiresAt?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mobileWebSessionId?: string
    accessToken?: string
    refreshToken?: string
    accessTokenExpiresAt?: number
    refreshRetryAt?: number
    accessTokenRefreshError?: string
    userId?: string
  }
}
