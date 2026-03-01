# WTT OAuth 配置信息 - ultraspace.ai

## 部署信息
- **生产域名**: https://www.ultraspace.ai
- **Vercel 域名**: https://wtt-web-saiph.vercel.app（重定向到 ultraspace.ai）
- **后端 API**: http://170.106.109.4:8000

## OAuth 回调 URL 配置

### GitHub OAuth App
1. 访问：https://github.com/settings/developers
2. 创建新的 OAuth App 或编辑现有的
3. 配置：
   - **Application name**: UltraSpace AI
   - **Homepage URL**: `https://www.ultraspace.ai`
   - **Authorization callback URL**: `https://www.ultraspace.ai/api/auth/callback/github`
   - （可选）本地开发：`http://localhost:3000/api/auth/callback/github`

### Google OAuth Client
1. 访问：https://console.cloud.google.com/apis/credentials
2. 创建 OAuth 2.0 Client ID
3. 配置：
   - **Authorized JavaScript origins**:
     - `https://www.ultraspace.ai`
     - `http://localhost:3000`（本地开发）
   - **Authorized redirect URIs**:
     - `https://www.ultraspace.ai/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`（本地开发）

### Twitter OAuth App
1. 访问：https://developer.twitter.com/en/portal/dashboard
2. 配置 OAuth 2.0 设置
3. 配置：
   - **Callback URLs**:
     - `https://www.ultraspace.ai/api/auth/callback/twitter`
     - `http://localhost:3000/api/auth/callback/twitter`（本地开发）
   - **Website URL**: `https://www.ultraspace.ai`

## Vercel 环境变量配置

在 Vercel 项目设置中更新以下环境变量：

```bash
# NextAuth 配置 - 使用自定义域名
NEXTAUTH_URL=https://www.ultraspace.ai
NEXTAUTH_SECRET=Fe8r7CuAQoCGbywnzMzN02MLoBh8HOO4Vcz5d2WozbQ=

# GitHub OAuth
GITHUB_CLIENT_ID=<从 GitHub OAuth App 获取>
GITHUB_CLIENT_SECRET=<从 GitHub OAuth App 获取>

# Google OAuth
GOOGLE_CLIENT_ID=<从 Google Cloud Console 获取>
GOOGLE_CLIENT_SECRET=<从 Google Cloud Console 获取>

# Twitter OAuth
TWITTER_CLIENT_ID=<从 Twitter Developer Portal 获取>
TWITTER_CLIENT_SECRET=<从 Twitter Developer Portal 获取>

# Backend API
NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
```

## 快速配置步骤

### 1. 更新 Vercel 环境变量

访问：https://vercel.com/cecwxf/wtt-web-saiph/settings/environment-variables

**重要**：将 `NEXTAUTH_URL` 从 `https://wtt-web-saiph.vercel.app` 更新为 `https://www.ultraspace.ai`

### 2. 创建/更新 OAuth 应用

#### GitHub
- 访问 https://github.com/settings/developers
- 更新回调 URL 为：`https://www.ultraspace.ai/api/auth/callback/github`

#### Google
- 访问 https://console.cloud.google.com/apis/credentials
- 更新 Authorized redirect URIs 为：`https://www.ultraspace.ai/api/auth/callback/google`
- 更新 Authorized JavaScript origins 为：`https://www.ultraspace.ai`

#### Twitter
- 访问 https://developer.twitter.com/en/portal/dashboard
- 更新 Callback URL 为：`https://www.ultraspace.ai/api/auth/callback/twitter`
- 更新 Website URL 为：`https://www.ultraspace.ai`

### 3. 重新部署

环境变量更新后，Vercel 会自动重新部署。

### 4. 测试登录

访问：https://www.ultraspace.ai/login

测试所有 OAuth 提供商的登录功能。

## 域名重定向说明

如果你在 Vercel 中配置了域名重定向：
- Vercel 域名 `wtt-web-saiph.vercel.app` 会自动重定向到 `www.ultraspace.ai`
- OAuth 回调必须使用最终域名 `www.ultraspace.ai`
- `NEXTAUTH_URL` 必须设置为 `https://www.ultraspace.ai`

## 注意事项

1. **所有 OAuth 应用的回调 URL 必须使用 `www.ultraspace.ai`**
2. **NEXTAUTH_URL 必须与实际访问的域名一致**
3. 如果同时保留 Vercel 域名和自定义域名，需要在两个域名的 OAuth 应用中都添加回调 URL
4. 域名更改后必须重新部署才能生效

## 故障排查

### "redirect_uri_mismatch" 错误
- 确认 OAuth 应用中的回调 URL 是 `https://www.ultraspace.ai/api/auth/callback/[provider]`
- 确认 NEXTAUTH_URL 设置为 `https://www.ultraspace.ai`
- 清除浏览器缓存后重试

### 登录后跳转到错误的域名
- 检查 NEXTAUTH_URL 是否正确设置
- 确认 Vercel 域名重定向配置正确

### "Configuration error"
- 确认所有环境变量已正确设置
- 确认 Vercel 已重新部署
