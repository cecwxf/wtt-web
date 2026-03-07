import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth"

/**
 * WeChat OAuth provider for NextAuth.js
 *
 * WeChat Open Platform uses a non-standard OAuth 2.0 flow:
 * - Uses `appid` / `secret` instead of `client_id` / `client_secret`
 * - QR code login via https://open.weixin.qq.com/connect/qrconnect
 * - Token exchange via https://api.weixin.qq.com/sns/oauth2/access_token
 * - User info via https://api.weixin.qq.com/sns/userinfo
 *
 * Docs: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */

interface WeChatProfile {
  openid: string
  nickname: string
  sex: number
  province: string
  city: string
  country: string
  headimgurl: string
  privilege: string[]
  unionid?: string
}

export default function WeChatProvider(
  options: OAuthUserConfig<WeChatProfile>
): OAuthConfig<WeChatProfile> {
  return {
    id: "wechat",
    name: "WeChat",
    type: "oauth",
    authorization: {
      url: "https://open.weixin.qq.com/connect/qrconnect",
      params: {
        appid: options.clientId,
        response_type: "code",
        scope: "snsapi_login",
      },
    },
    token: {
      url: "https://api.weixin.qq.com/sns/oauth2/access_token",
      async request({ params }) {
        const url = new URL(
          "https://api.weixin.qq.com/sns/oauth2/access_token"
        )
        url.searchParams.set("appid", options.clientId!)
        url.searchParams.set("secret", options.clientSecret!)
        url.searchParams.set("code", params.code as string)
        url.searchParams.set("grant_type", "authorization_code")

        const response = await fetch(url.toString())
        const data = await response.json()

        return {
          tokens: {
            access_token: data.access_token,
            token_type: "bearer",
            expires_in: data.expires_in,
            refresh_token: data.refresh_token,
            id_token: data.openid,
          },
        }
      },
    },
    userinfo: {
      url: "https://api.weixin.qq.com/sns/userinfo",
      async request({ tokens }) {
        const url = new URL("https://api.weixin.qq.com/sns/userinfo")
        url.searchParams.set("access_token", tokens.access_token as string)
        url.searchParams.set("openid", tokens.id_token as string)
        url.searchParams.set("lang", "zh_CN")

        const response = await fetch(url.toString())
        return response.json()
      },
    },
    profile(profile) {
      return {
        id: profile.unionid ?? profile.openid,
        name: profile.nickname,
        image: profile.headimgurl,
        email: null,
      }
    },
    checks: ["state"],
    options,
  }
}
