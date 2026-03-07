# OAuth 配置指南

本文档说明如何配置 GitHub、Google 和 Twitter OAuth 登录。

## 前置要求

- Vercel 部署域名（例如：https://wtt-web.vercel.app）
- 后端 API 地址（例如：http://170.106.109.4:8000）

## 1. GitHub OAuth 配置

### 创建 GitHub OAuth App

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 **"New OAuth App"**
3. 填写以下信息：
   - **Application name**: WTT
   - **Homepage URL**: `https://your-domain.vercel.app`
   - **Authorization callback URL**: `https://your-domain.vercel.app/api/auth/callback/github`
4. 点击 **"Register application"**
5. 记录 **Client ID**
6. 点击 **"Generate a new client secret"** 并记录 **Client Secret**

### 本地开发配置

如需本地开发，在同一个 OAuth App 中添加：
- **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

## 2. Google OAuth 配置

### 创建 Google OAuth Client

1. 访问 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建项目（如果还没有）
3. 启用 **Google+ API**（在 API Library 中搜索并启用）
4. 点击 **"Create Credentials"** > **"OAuth client ID"**
5. 如果是首次创建，需要先配置 OAuth consent screen：
   - User Type: External
   - App name: WTT
   - User support email: 你的邮箱
   - Developer contact: 你的邮箱
6. 选择 **"Web application"**
7. 填写以下信息：
   - **Name**: WTT
   - **Authorized JavaScript origins**:
     - `https://your-domain.vercel.app`
     - `http://localhost:3000`（本地开发）
   - **Authorized redirect URIs**:
     - `https://your-domain.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`（本地开发）
8. 点击 **"Create"**
9. 记录 **Client ID** 和 **Client Secret**

## 3. Twitter OAuth 配置

### 创建 Twitter OAuth App

1. 访问 [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. 创建项目（如果还没有）
3. 在项目中创建 App
4. 进入 App Settings > User authentication settings
5. 点击 **"Set up"**
6. 配置：
   - **App permissions**: Read
   - **Type of App**: Web App, Automated App or Bot
   - **App info**:
     - **Callback URI / Redirect URL**:
       - `https://your-domain.vercel.app/api/auth/callback/twitter`
       - `http://localhost:3000/api/auth/callback/twitter`（本地开发）
     - **Website URL**: `https://your-domain.vercel.app`
7. 保存后，在 **"Keys and tokens"** 标签页获取：
   - **OAuth 2.0 Client ID**
   - **OAuth 2.0 Client Secret**

## 4. 微信 OAuth 配置 (WeChat)

### 创建微信开放平台应用

1. 访问 [微信开放平台](https://open.weixin.qq.com/)
2. 注册开发者账号（需要企业或组织身份认证）
3. 进入 **管理中心** > **网站应用** > **创建网站应用**
4. 填写以下信息：
   - **应用名称**: WTT
   - **应用官网**: `https://your-domain.vercel.app`
5. 提交审核并等待通过
6. 审核通过后，在应用详情页获取：
   - **AppID** (应用ID)
   - **AppSecret** (应用密钥)
7. 在 **接口权限** 中申请 **网站应用微信登录** 权限
8. 在 **授权回调域** 中配置：
   - 开发环境: `localhost:3000`
   - 生产环境: `your-domain.vercel.app`（不带协议前缀）

### 微信登录流程

微信网站应用使用扫码登录方式：
1. 用户点击「微信登录」按钮
2. 页面跳转至微信扫码页面
3. 用户使用微信 App 扫描二维码
4. 用户在微信中确认授权
5. 微信回调到应用，完成登录

## 5. 配置环境变量

### Vercel 环境变量

在 Vercel 项目设置中添加以下环境变量：

```bash
# NextAuth
NEXTAUTH_URL=https://your-domain.vercel.app
NEXTAUTH_SECRET=<生成一个随机字符串>

# GitHub OAuth
GITHUB_CLIENT_ID=<你的 GitHub Client ID>
GITHUB_CLIENT_SECRET=<你的 GitHub Client Secret>

# Google OAuth
GOOGLE_CLIENT_ID=<你的 Google Client ID>
GOOGLE_CLIENT_SECRET=<你的 Google Client Secret>

# Twitter OAuth
TWITTER_CLIENT_ID=<你的 Twitter Client ID>
TWITTER_CLIENT_SECRET=<你的 Twitter Client Secret>

# WeChat OAuth (微信)
WECHAT_APP_ID=<你的微信 AppID>
WECHAT_APP_SECRET=<你的微信 AppSecret>

# Backend API
NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
```

生成 NEXTAUTH_SECRET：
```bash
openssl rand -base64 32
```

### 本地开发环境变量

更新 `.env.local` 文件：

```bash
# WTT Backend API
NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<生成一个随机字符串>

# GitHub OAuth
GITHUB_CLIENT_ID=<你的 GitHub Client ID>
GITHUB_CLIENT_SECRET=<你的 GitHub Client Secret>

# Google OAuth
GOOGLE_CLIENT_ID=<你的 Google Client ID>
GOOGLE_CLIENT_SECRET=<你的 Google Client Secret>

# Twitter OAuth
TWITTER_CLIENT_ID=<你的 Twitter Client ID>
TWITTER_CLIENT_SECRET=<你的 Twitter Client Secret>

# WeChat OAuth (微信)
WECHAT_APP_ID=<你的微信 AppID>
WECHAT_APP_SECRET=<你的微信 AppSecret>

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6. 后端配置

确保后端 API 的 OAuth 回调端点正确配置：

- `/auth/oauth/callback` - 处理 OAuth 回调

## 7. 测试

1. 重新部署 Vercel 应用（环境变量更新后会自动触发）
2. 访问登录页面
3. 测试每个 OAuth 提供商的登录流程

## 常见问题

### 1. "redirect_uri_mismatch" 错误

- 检查 OAuth App 中配置的回调 URL 是否与实际 URL 完全匹配
- 确保包含协议（http/https）
- 确保没有多余的斜杠

### 2. "invalid_client" 错误

- 检查 Client ID 和 Client Secret 是否正确
- 确保环境变量已正确设置并重新部署

### 3. Google OAuth 错误 "Access blocked"

- 确保已配置 OAuth consent screen
- 如果是测试阶段，将测试用户添加到 Test users 列表

### 4. Twitter OAuth 错误

- 确保使用的是 OAuth 2.0（不是 OAuth 1.0a）
- 检查 App permissions 是否正确设置

### 5. 微信登录常见问题

- **"redirect_uri 参数错误"**: 微信开放平台中的「授权回调域」只需填写域名（如 `your-domain.vercel.app`），不需要协议前缀和路径。NextAuth 会自动生成完整的回调 URL（`/api/auth/callback/wechat`）
- **需要企业认证**: 微信开放平台的网站应用需要企业或组织身份认证才能使用
- **scope 错误**: 确保已在微信开放平台申请了「网站应用微信登录」接口权限

## 安全建议

1. **永远不要**将 Client Secret 提交到 Git 仓库
2. 定期轮换 Client Secret
3. 在生产环境使用强随机的 NEXTAUTH_SECRET
4. 限制 OAuth App 的权限范围（只请求必要的权限）
5. 监控 OAuth 应用的使用情况
