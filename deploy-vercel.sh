#!/bin/bash

# WTT Web - Vercel 快速部署脚本

echo "🚀 WTT Web Vercel 部署助手"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在 wtt-web 目录下运行此脚本"
    exit 1
fi

# 检查 git 状态
if [ ! -d ".git" ]; then
    echo "❌ 错误: Git 仓库未初始化"
    echo "   运行: git init"
    exit 1
fi

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "⚠️  检测到未提交的更改"
    echo ""
    read -p "是否提交所有更改? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        read -p "输入提交信息: " commit_msg
        git commit -m "$commit_msg"
        echo "✅ 更改已提交"
    fi
fi

# 检查远程仓库
if ! git remote get-url origin &>/dev/null; then
    echo ""
    echo "📝 配置 GitHub 远程仓库"
    echo ""
    read -p "输入你的 GitHub 用户名: " github_user
    read -p "输入仓库名称 (默认: wtt-web): " repo_name
    repo_name=${repo_name:-wtt-web}

    git remote add origin "https://github.com/$github_user/$repo_name.git"
    echo "✅ 远程仓库已配置: https://github.com/$github_user/$repo_name"
fi

# 推送到 GitHub
echo ""
echo "📤 推送到 GitHub..."
git branch -M main

if git push -u origin main; then
    echo "✅ 代码已推送到 GitHub"
else
    echo "❌ 推送失败"
    echo ""
    echo "可能的原因:"
    echo "1. 仓库不存在 - 请先在 GitHub 创建仓库"
    echo "2. 认证失败 - 请配置 Personal Access Token"
    echo ""
    echo "创建 Personal Access Token:"
    echo "1. 访问 https://github.com/settings/tokens"
    echo "2. Generate new token (classic)"
    echo "3. 勾选 'repo' 权限"
    echo "4. 复制 token"
    echo "5. 使用 token 作为密码推送"
    exit 1
fi

# Vercel 部署说明
echo ""
echo "✅ GitHub 推送成功！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 下一步: 在 Vercel 部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 访问 https://vercel.com"
echo "2. 使用 GitHub 账号登录"
echo "3. 点击 'Add New...' → 'Project'"
echo "4. 选择 '$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')' 仓库"
echo "5. 配置环境变量:"
echo "   NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000"
echo "6. 点击 'Deploy'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 详细说明请查看: VERCEL_DEPLOYMENT.md"
echo ""

# 询问是否安装 Vercel CLI
echo ""
read -p "是否安装 Vercel CLI 进行命令行部署? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 安装 Vercel CLI..."
    npm i -g vercel

    echo ""
    echo "✅ Vercel CLI 已安装"
    echo ""
    echo "使用 Vercel CLI 部署:"
    echo "  vercel          # 预览部署"
    echo "  vercel --prod   # 生产部署"
    echo ""

    read -p "是否现在部署到 Vercel? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "🚀 开始部署..."
        vercel
    fi
fi

echo ""
echo "🎉 完成！"
