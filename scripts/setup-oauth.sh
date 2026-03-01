#!/bin/bash

# OAuth 配置助手脚本
# 用于快速配置 Vercel 环境变量

echo "==================================="
echo "WTT OAuth 配置助手"
echo "==================================="
echo ""

# 检查是否安装了 vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI 未安装"
    echo "请运行: npm install -g vercel"
    exit 1
fi

echo "请输入以下信息："
echo ""

# 获取 Vercel 域名
read -p "Vercel 部署域名 (例如: wtt-web.vercel.app): " VERCEL_DOMAIN
if [ -z "$VERCEL_DOMAIN" ]; then
    echo "❌ 域名不能为空"
    exit 1
fi

# 生成 NEXTAUTH_SECRET
echo ""
echo "生成 NEXTAUTH_SECRET..."
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "✓ 已生成: $NEXTAUTH_SECRET"

# 获取 OAuth 凭证
echo ""
echo "请输入 OAuth 凭证（如果暂时没有，可以输入 'skip' 跳过）："
echo ""

read -p "GitHub Client ID: " GITHUB_CLIENT_ID
read -p "GitHub Client Secret: " GITHUB_CLIENT_SECRET
echo ""

read -p "Google Client ID: " GOOGLE_CLIENT_ID
read -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""

read -p "Twitter Client ID: " TWITTER_CLIENT_ID
read -p "Twitter Client Secret: " TWITTER_CLIENT_SECRET
echo ""

# 设置 Vercel 环境变量
echo "==================================="
echo "开始设置 Vercel 环境变量..."
echo "==================================="
echo ""

vercel env add NEXTAUTH_URL production <<< "https://$VERCEL_DOMAIN"
vercel env add NEXTAUTH_SECRET production <<< "$NEXTAUTH_SECRET"

if [ "$GITHUB_CLIENT_ID" != "skip" ] && [ -n "$GITHUB_CLIENT_ID" ]; then
    vercel env add GITHUB_CLIENT_ID production <<< "$GITHUB_CLIENT_ID"
    vercel env add GITHUB_CLIENT_SECRET production <<< "$GITHUB_CLIENT_SECRET"
fi

if [ "$GOOGLE_CLIENT_ID" != "skip" ] && [ -n "$GOOGLE_CLIENT_ID" ]; then
    vercel env add GOOGLE_CLIENT_ID production <<< "$GOOGLE_CLIENT_ID"
    vercel env add GOOGLE_CLIENT_SECRET production <<< "$GOOGLE_CLIENT_SECRET"
fi

if [ "$TWITTER_CLIENT_ID" != "skip" ] && [ -n "$TWITTER_CLIENT_ID" ]; then
    vercel env add TWITTER_CLIENT_ID production <<< "$TWITTER_CLIENT_ID"
    vercel env add TWITTER_CLIENT_SECRET production <<< "$TWITTER_CLIENT_SECRET"
fi

echo ""
echo "==================================="
echo "✓ 配置完成！"
echo "==================================="
echo ""
echo "下一步："
echo "1. 运行 'vercel --prod' 重新部署应用"
echo "2. 或者在 Vercel Dashboard 中手动触发部署"
echo ""
echo "OAuth 回调 URL 配置："
echo "- GitHub: https://$VERCEL_DOMAIN/api/auth/callback/github"
echo "- Google: https://$VERCEL_DOMAIN/api/auth/callback/google"
echo "- Twitter: https://$VERCEL_DOMAIN/api/auth/callback/twitter"
echo ""
