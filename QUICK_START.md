# 快速配置指南

## 🚀 立即开始配置 OAuth

### 第一步：生成 NEXTAUTH_SECRET

已为你生成：
```
Fe8r7CuAQoCGbywnzMzN02MLoBh8HOO4Vcz5d2WozbQ=
```

### 第二步：创建 OAuth 应用

#### 1️⃣ GitHub OAuth App
- 访问：https://github.com/settings/developers
- 点击 "New OAuth App"
- 填写：
  - Application name: `WTT`
  - Homepage URL: `https://wtt-web-saiph.vercel.app`
  - Callback URL: `https://wtt-web-saiph.vercel.app/api/auth/callback/github`
- 保存 Client ID 和 Client Secret

#### 2️⃣ Google OAuth Client
- 访问：https://console.cloud.google.com/apis/credentials
- 创建 OAuth 2.0 Client ID
- 填写：
  - Authorized JavaScript origins: `https://wtt-web-saiph.vercel.app`
  - Authorized redirect URIs: `https://wtt-web-saiph.vercel.app/api/auth/callback/google`
- 保存 Client ID 和 Client Secret

#### 3️⃣ Twitter OAuth App
- 访问：https://developer.twitter.com/en/portal/dashboard
- 创建 App 并启用 OAuth 2.0
- 填写：
  - Callback URL: `https://wtt-web-saiph.vercel.app/api/auth/callback/twitter`
  - Website URL: `https://wtt-web-saiph.vercel.app`
- 保存 Client ID 和 Client Secret

### 第三步：配置 Vercel 环境变量

访问：https://vercel.com/cecwxf/wtt-web-saiph/settings/environment-variables

添加以下环境变量（选择 Production 环境）：

| 变量名 | 值 |
|--------|-----|
| `NEXTAUTH_URL` | `https://wtt-web-saiph.vercel.app` |
| `NEXTAUTH_SECRET` | `Fe8r7CuAQoCGbywnzMzN02MLoBh8HOO4Vcz5d2WozbQ=` |
| `GITHUB_CLIENT_ID` | 从 GitHub 获取 |
| `GITHUB_CLIENT_SECRET` | 从 GitHub 获取 |
| `GOOGLE_CLIENT_ID` | 从 Google 获取 |
| `GOOGLE_CLIENT_SECRET` | 从 Google 获取 |
| `TWITTER_CLIENT_ID` | 从 Twitter 获取 |
| `TWITTER_CLIENT_SECRET` | 从 Twitter 获取 |
| `NEXT_PUBLIC_WTT_API_URL` | `http://170.106.109.4:8000` |

### 第四步：重新部署

环境变量添加后，Vercel 会自动重新部署。

或者手动触发：
```bash
vercel --prod
```

### 第五步：测试

访问：https://wtt-web-saiph.vercel.app/login

测试：
- ✅ 邮箱注册/登录
- ✅ GitHub OAuth 登录
- ✅ Google OAuth 登录
- ✅ Twitter OAuth 登录

## 📝 注意事项

1. **NEXTAUTH_SECRET** 必须设置，否则 NextAuth 无法工作
2. **回调 URL** 必须完全匹配，包括协议（https://）
3. 如果某个 OAuth 提供商暂时不用，可以先不配置其环境变量
4. 环境变量更新后必须重新部署才能生效

## 🔧 故障排查

### 登录按钮无反应
- 打开浏览器开发者工具查看 Console 错误
- 检查 Network 标签页是否有 API 请求失败

### "Configuration error"
- 检查 NEXTAUTH_SECRET 是否已设置
- 检查 NEXTAUTH_URL 是否正确

### "redirect_uri_mismatch"
- 检查 OAuth App 中的回调 URL 是否与实际 URL 完全匹配
- 确保没有多余的斜杠

### "invalid_client"
- 检查 Client ID 和 Client Secret 是否正确
- 确认环境变量名称拼写正确

## 📞 需要帮助？

如果遇到问题，请提供：
1. 错误信息截图
2. 浏览器 Console 日志
3. 具体的操作步骤
