# WTT Web - Vercel 部署完成

## 🎉 项目已准备好部署到 Vercel！

## 当前状态

✅ Git 仓库已初始化
✅ 所有代码已提交
✅ Vercel 配置文件已创建
✅ 部署脚本已准备
✅ 文档已完善

## 快速开始

### 选项 1: 使用自动部署脚本（最简单）

```bash
cd /home/cecwxf/workspace/agent_ref/wtt_project/wtt-web
./deploy-vercel.sh
```

脚本会引导你完成整个部署流程。

### 选项 2: 手动部署

#### 步骤 1: 推送到 GitHub

```bash
# 在 GitHub 创建新仓库: https://github.com/new
# 仓库名: wtt-web

# 添加远程仓库
git remote add origin https://github.com/你的用户名/wtt-web.git

# 推送代码
git branch -M main
git push -u origin main
```

#### 步骤 2: 在 Vercel 部署

1. 访问 https://vercel.com
2. 使用 GitHub 登录
3. 点击 "Add New..." → "Project"
4. 选择 `wtt-web` 仓库
5. 配置环境变量:
   ```
   NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
   ```
6. 点击 "Deploy"
7. 等待 1-2 分钟完成部署

#### 步骤 3: 更新后端 CORS

部署成功后，你会得到一个 URL，如: `https://wtt-web-xxx.vercel.app`

更新 WTT 后端 CORS 配置:

```bash
cd /home/cecwxf/workspace/agent_ref/wtt_project
```

编辑 `wtt_service/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://wtt-web-xxx.vercel.app",  # 替换为你的实际 URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

重新部署后端:

```bash
./deploy.sh
```

### 选项 3: 使用 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署到生产环境
vercel --prod
```

## 项目文件

```
wtt-web/
├── VERCEL_DEPLOYMENT.md      # 详细部署指南
├── VERCEL_QUICKSTART.md      # 快速参考
├── deploy-vercel.sh          # 自动部署脚本
├── vercel.json               # Vercel 配置
├── README.md                 # 项目文档
├── DEPLOYMENT.md             # 通用部署指南
└── IMPLEMENTATION_SUMMARY.md # 实现总结
```

## 环境变量

| 变量名 | 值 | 必需 |
|--------|-----|------|
| `NEXT_PUBLIC_WTT_API_URL` | `http://170.106.109.4:8000` | ✅ 是 |

## 部署后验证

1. 访问 Vercel 提供的 URL
2. 注册新用户
3. 浏览 Discover 页面（应该看到 15+ 个 Topic）
4. 加入一个 Topic
5. 查看 Inbox 消息
6. 发送消息测试

## 常见问题

### Q: 如何获取 Personal Access Token？

A:
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 勾选 `repo` 权限
4. 复制 token
5. 推送时使用 token 作为密码

### Q: API 连接失败怎么办？

A:
1. 检查环境变量是否正确设置
2. 确认 WTT 后端正在运行
3. 更新后端 CORS 配置
4. 查看浏览器控制台错误

### Q: 如何更新部署？

A:
```bash
git add .
git commit -m "Update"
git push
```

Vercel 会自动重新部署。

### Q: 如何回滚到之前的版本？

A:
1. 在 Vercel 项目页面点击 "Deployments"
2. 找到要回滚的版本
3. 点击 "..." → "Promote to Production"

## 监控和分析

### Vercel Dashboard

访问 https://vercel.com/dashboard 查看：
- 部署状态
- 构建日志
- 性能指标
- 访问统计

### 实时日志

```bash
vercel logs --follow
```

## 自定义域名（可选）

1. 在 Vercel 项目设置中添加域名
2. 配置 DNS 记录
3. 等待 SSL 证书自动生成

## 成本

- **免费版**:
  - 100 GB 带宽/月
  - 无限部署
  - 自动 HTTPS
  - 基础分析

- **Pro 版** ($20/月):
  - 1 TB 带宽/月
  - 高级分析
  - 密码保护
  - 更多功能

## 下一步

1. ✅ 部署到 Vercel
2. 配置自定义域名
3. 启用 Analytics
4. 添加更多功能（P2P 聊天、Agent 控制台等）
5. 优化性能和 SEO

## 技术支持

- **Vercel 文档**: https://vercel.com/docs
- **Next.js 文档**: https://nextjs.org/docs
- **项目文档**: 查看 `VERCEL_DEPLOYMENT.md`

## Git 提交历史

```bash
# 查看提交历史
git log --oneline

# 当前提交
a27e4ca Initial commit: WTT Web Client MVP
13c925b Add Vercel deployment guides and scripts
```

## 准备就绪！

所有文件已准备完毕，现在可以开始部署了！

**推荐使用自动部署脚本**:
```bash
./deploy-vercel.sh
```

或者按照 `VERCEL_DEPLOYMENT.md` 中的详细步骤手动部署。

祝部署顺利！🚀
