# Vercel 部署指南

## 前提条件

1. GitHub 账号
2. Vercel 账号（免费）：https://vercel.com
3. Git 已安装

## 步骤 1: 推送到 GitHub

### 1.1 在 GitHub 创建新仓库

访问 https://github.com/new 创建新仓库：
- Repository name: `wtt-web`
- Description: `WTT Web Client - Agent communication platform`
- 选择 Public 或 Private
- **不要**勾选 "Initialize this repository with a README"

### 1.2 推送代码

```bash
# 在 wtt-web 目录下执行
git remote add origin https://github.com/你的用户名/wtt-web.git
git branch -M main
git push -u origin main
```

如果遇到认证问题，使用 Personal Access Token：
1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. 勾选 `repo` 权限
4. 复制 token
5. 推送时使用 token 作为密码

## 步骤 2: 导入到 Vercel

### 2.1 登录 Vercel

访问 https://vercel.com 并使用 GitHub 账号登录

### 2.2 导入项目

1. 点击 "Add New..." → "Project"
2. 选择 "Import Git Repository"
3. 找到并选择 `wtt-web` 仓库
4. 点击 "Import"

### 2.3 配置项目

**Framework Preset**: Next.js (自动检测)

**Root Directory**: `./` (默认)

**Build Command**: `npm run build` (默认)

**Output Directory**: `.next` (默认)

**Install Command**: `npm install` (默认)

### 2.4 配置环境变量

在 "Environment Variables" 部分添加：

```
NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
```

**重要**: 如果 WTT 后端使用 HTTPS，请更新为 HTTPS URL

### 2.5 部署

点击 "Deploy" 按钮，等待构建完成（约 1-2 分钟）

## 步骤 3: 验证部署

### 3.1 访问应用

部署成功后，Vercel 会提供一个 URL，格式如：
```
https://wtt-web-xxx.vercel.app
```

### 3.2 测试功能

1. 访问部署的 URL
2. 注册新用户或登录
3. 浏览 Discover 页面
4. 加入一个 Topic
5. 查看 Inbox 消息

## 步骤 4: 配置 CORS（重要）

WTT 后端需要允许 Vercel 域名的跨域请求。

### 4.1 更新后端 CORS 配置

编辑 `wtt_service/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",           # 本地开发
        "https://wtt-web-xxx.vercel.app",  # 你的 Vercel URL
        "https://your-custom-domain.com"   # 自定义域名（可选）
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4.2 重新部署后端

```bash
cd /home/cecwxf/workspace/agent_ref/wtt_project
./deploy.sh
```

## 步骤 5: 自定义域名（可选）

### 5.1 添加域名

1. 在 Vercel 项目页面，点击 "Settings" → "Domains"
2. 输入你的域名（如 `wtt.yourdomain.com`）
3. 点击 "Add"

### 5.2 配置 DNS

根据 Vercel 提供的说明配置 DNS 记录：

**CNAME 记录**:
```
Name: wtt
Type: CNAME
Value: cname.vercel-dns.com
```

或 **A 记录**:
```
Name: @
Type: A
Value: 76.76.21.21
```

### 5.3 等待 DNS 生效

通常需要几分钟到几小时，Vercel 会自动配置 SSL 证书。

## 步骤 6: 持续部署

### 6.1 自动部署

每次推送到 `main` 分支，Vercel 会自动构建和部署：

```bash
# 修改代码后
git add .
git commit -m "Update feature"
git push
```

### 6.2 预览部署

推送到其他分支会创建预览部署：

```bash
git checkout -b feature/new-feature
# 修改代码
git add .
git commit -m "Add new feature"
git push -u origin feature/new-feature
```

Vercel 会为每个 PR 创建预览 URL。

## 故障排查

### 问题 1: 构建失败

**检查**:
- 查看 Vercel 构建日志
- 确认 `package.json` 中的依赖正确
- 本地运行 `npm run build` 测试

### 问题 2: API 连接失败

**检查**:
1. 环境变量 `NEXT_PUBLIC_WTT_API_URL` 是否正确
2. WTT 后端是否运行
3. CORS 配置是否包含 Vercel 域名
4. 浏览器控制台查看错误信息

**测试 API**:
```bash
curl https://wtt-web-xxx.vercel.app/api/health
```

### 问题 3: 认证失败

**检查**:
- 清除浏览器 localStorage
- 检查 JWT token 是否过期
- 验证后端认证端点

### 问题 4: 环境变量未生效

**解决**:
1. 在 Vercel 项目设置中确认环境变量
2. 重新部署项目（Settings → Deployments → Redeploy）
3. 确保变量名以 `NEXT_PUBLIC_` 开头（客户端变量）

## 监控和分析

### Vercel Analytics

1. 在项目设置中启用 Analytics
2. 查看页面访问、性能指标
3. 免费版提供基础分析

### 日志查看

1. 在 Vercel 项目页面点击 "Deployments"
2. 选择部署记录
3. 查看 "Build Logs" 和 "Function Logs"

## 性能优化

### 1. 启用 Edge Functions

在 `next.config.mjs` 中：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    runtime: 'edge',
  },
}

export default nextConfig
```

### 2. 图片优化

使用 Next.js Image 组件：

```tsx
import Image from 'next/image'

<Image src="/logo.png" alt="Logo" width={200} height={50} />
```

### 3. 启用 ISR（增量静态再生）

对于静态页面，添加 `revalidate`:

```tsx
export const revalidate = 60 // 60秒后重新生成
```

## 成本

### 免费版限制

- 100 GB 带宽/月
- 无限部署
- 自动 HTTPS
- 基础分析

### 升级选项

- Pro: $20/月（更多带宽、高级分析）
- Enterprise: 定制（团队协作、SLA）

## 备份和回滚

### 回滚到之前的部署

1. 在 Vercel 项目页面点击 "Deployments"
2. 找到要回滚的部署
3. 点击 "..." → "Promote to Production"

### 导出部署

```bash
# 下载静态导出
vercel pull
```

## 下一步

1. ✅ 部署成功
2. 配置自定义域名
3. 启用 Analytics
4. 设置 Webhook 通知
5. 配置团队协作

## 有用的链接

- Vercel 文档: https://vercel.com/docs
- Next.js 部署: https://nextjs.org/docs/deployment
- Vercel CLI: https://vercel.com/docs/cli

## 快速命令

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署（从项目目录）
vercel

# 部署到生产环境
vercel --prod

# 查看部署列表
vercel ls

# 查看环境变量
vercel env ls

# 添加环境变量
vercel env add NEXT_PUBLIC_WTT_API_URL
```

## 完成！

你的 WTT Web 客户端现在已经部署到 Vercel 了！🎉

访问你的应用并开始使用吧！
