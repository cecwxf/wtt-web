# WTT OAuth 配置信息

## 部署信息
- **Vercel 域名**: https://wtt-web-saiph.vercel.app
- **后端 API**: http://170.106.109.4:8000

## OAuth 回调 URL 配置

### GitHub OAuth App
1. 访问：https://github.com/settings/developers
2. 创建新的 OAuth App 或编辑现有的
3. 配置：
   - **Application name**: WTT
   - **Homepage URL**: `https://wtt-web-saiph.vercel.app`
   - **Authorization callback URL**: `https://wtt-web-saiph.vercel.app/api/auth/callback/github`
   - （可选）本地开发：`http://localhost:3000/api/auth/callback/github`

### Google OAuth Client
1. 访问：https://console.cloud.google.com/apis/credentials
2. 创建 OAuth 2.0 Client ID
3. 配置：
   - **Authorized JavaScript origins**:
     - `https://wtt-web-saiph.vercel.app`
     - `http://localhost:3000`（本地开发）
   - **Authorized redirect URIs**:
     - `https://wtt-web-saiph.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`（本地开发）

### Twitter OAuth App
1. 访问：https://developer.twitter.com/en/portal/dashboard
2. 配置 OAuth 2.0 设置
3. 配置：
   - **Callback URLs**:
     - `https://wtt-web-saiph.vercel.app/api/auth/callback/twitter`
     - `http://localhost:3000/api/auth/callback/twitter`（本地开发）
   - **Website URL**: `https://wtt-web-saiph.vercel.app`

## Vercel 环境变量配置

在 Vercel 项目设置中添加以下环境变量：

```bash
# NextAuth 配置
NEXTAUTH_URL=https://wtt-web-saiph.vercel.app
NEXTAUTH_SECRET=<运行下面命令生成>

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

### 生成 NEXTAUTH_SECRET

在本地运行：
```bash
openssl rand -base64 32
```

将生成的字符串作为 `NEXTAUTH_SECRET` 的值。

## 快速配置步骤

### 1. 创建 OAuth 应用（按顺序）

#### GitHub
1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 填写上述信息
4. 保存 Client ID 和 Client Secret

#### Google
1. 访问 https://console.cloud.google.com/apis/credentials
2. 创建项目（如果需要）
3. 配置 OAuth consent screen
4. 创建 OAuth 2.0 Client ID
5. 保存 Client ID 和 Client Secret

#### Twitter
1. 访问 https://developer.twitter.com/en/portal/dashboard
2. 创建项目和 App（如果需要）
3. 启用 OAuth 2.0
4. 配置回调 URL
5. 保存 Client ID 和 Client Secret

### 2. 配置 Vercel 环境变量

**方式 A：通过 Vercel Dashboard**
1. 访问：https://vercel.com/cecwxf/wtt-web-saiph/settings/environment-variables
2. 逐个添加上述环境变量
3. 选择环境：Production, Preview, Development（根据需要）

**方式 B：通过 Vercel CLI**
```bash
cd /home/cecwxf/workspace/agent_ref/wtt_project/wtt-web

# 生成 NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# 设置环境变量
vercel env add NEXTAUTH_URL production
# 输入: https://wtt-web-saiph.vercel.app

vercel env add NEXTAUTH_SECRET production
# 输入: 上面生成的 secret

vercel env add GITHUB_CLIENT_ID production
# 输入: 你的 GitHub Client ID

vercel env add GITHUB_CLIENT_SECRET production
# 输入: 你的 GitHub Client Secret

vercel env add GOOGLE_CLIENT_ID production
# 输入: 你的 Google Client ID

vercel env add GOOGLE_CLIENT_SECRET production
# 输入: 你的 Google Client Secret

vercel env add TWITTER_CLIENT_ID production
# 输入: 你的 Twitter Client ID

vercel env add TWITTER_CLIENT_SECRET production
# 输入: 你的 Twitter Client Secret
```

### 3. 重新部署

环境变量更新后，Vercel 会自动触发重新部署。或者手动触发：
```bash
vercel --prod
```

## 测试登录

部署完成后，访问：
- https://wtt-web-saiph.vercel.app/login

测试每个 OAuth 提供商的登录功能。

## 常见问题排查

### 登录按钮点击无反应
- 检查浏览器控制台是否有错误
- 确认环境变量已正确设置
- 确认 Vercel 已重新部署

### "redirect_uri_mismatch" 错误
- 检查 OAuth App 中的回调 URL 是否完全匹配
- 确保 URL 包含 `https://` 协议
- 确保没有多余的斜杠

### "invalid_client" 错误
- 检查 Client ID 和 Client Secret 是否正确复制
- 确认环境变量名称拼写正确
- 重新部署 Vercel 应用

### Google "Access blocked" 错误
- 确保已配置 OAuth consent screen
- 将测试用户添加到 Test users 列表
- 检查 OAuth scopes 是否正确

## 下一步

配置完成后，你可以：
1. 测试邮箱注册/登录
2. 测试 GitHub OAuth 登录
3. 测试 Google OAuth 登录
4. 测试 Twitter OAuth 登录
5. 测试 Agent 管理功能
6. 测试多 Agent 切换功能
