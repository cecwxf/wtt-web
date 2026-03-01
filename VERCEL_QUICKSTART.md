# Vercel 部署快速参考

## 方法 1: 使用部署脚本（推荐）

```bash
./deploy-vercel.sh
```

脚本会自动：
1. 检查 git 状态
2. 提交未保存的更改
3. 配置 GitHub 远程仓库
4. 推送代码到 GitHub
5. 提供 Vercel 部署说明

## 方法 2: 手动部署

### 步骤 1: 推送到 GitHub

```bash
# 如果还没有远程仓库
git remote add origin https://github.com/你的用户名/wtt-web.git

# 推送代码
git branch -M main
git push -u origin main
```

### 步骤 2: 在 Vercel 部署

1. 访问 https://vercel.com
2. 登录并点击 "Add New..." → "Project"
3. 选择 GitHub 仓库
4. 添加环境变量:
   ```
   NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
   ```
5. 点击 "Deploy"

## 方法 3: 使用 Vercel CLI

```bash
# 安装 CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

## 环境变量

在 Vercel 项目设置中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_WTT_API_URL` | `http://170.106.109.4:8000` | WTT 后端 API 地址 |

## 部署后配置

### 更新后端 CORS

编辑 `wtt_service/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://你的应用.vercel.app",  # 替换为实际 URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

重新部署后端:
```bash
cd /home/cecwxf/workspace/agent_ref/wtt_project
./deploy.sh
```

## 常用命令

```bash
# 查看部署状态
vercel ls

# 查看日志
vercel logs

# 添加环境变量
vercel env add NEXT_PUBLIC_WTT_API_URL

# 查看环境变量
vercel env ls

# 删除部署
vercel rm <deployment-url>
```

## 自动部署

推送到 `main` 分支会自动触发部署：

```bash
git add .
git commit -m "Update feature"
git push
```

## 预览部署

推送到其他分支会创建预览：

```bash
git checkout -b feature/new-feature
git push -u origin feature/new-feature
```

## 故障排查

### API 连接失败

1. 检查环境变量是否正确
2. 检查 CORS 配置
3. 查看浏览器控制台错误

### 构建失败

1. 查看 Vercel 构建日志
2. 本地运行 `npm run build` 测试
3. 检查依赖版本

### 认证问题

1. 清除浏览器 localStorage
2. 重新登录
3. 检查 JWT token

## 监控

- 访问 Vercel 项目页面查看：
  - 部署历史
  - 构建日志
  - 性能分析
  - 访问统计

## 回滚

在 Vercel 项目页面：
1. Deployments → 选择之前的部署
2. 点击 "..." → "Promote to Production"

## 自定义域名

1. Settings → Domains
2. 添加域名
3. 配置 DNS 记录
4. 等待 SSL 证书生成

## 成本

- 免费版: 100 GB 带宽/月
- Pro: $20/月（更多带宽）
- Enterprise: 定制

## 文档

- 详细指南: `VERCEL_DEPLOYMENT.md`
- 项目文档: `README.md`
- 部署文档: `DEPLOYMENT.md`

## 支持

- Vercel 文档: https://vercel.com/docs
- Next.js 文档: https://nextjs.org/docs
- GitHub Issues: 在你的仓库创建 issue
