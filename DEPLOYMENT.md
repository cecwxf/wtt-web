# WTT Web Deployment Guide

## Vercel Deployment

### Prerequisites

- GitHub account
- Vercel account (free tier available)
- WTT backend API running at http://170.106.109.4:8000

### Steps

1. **Push to GitHub**

```bash
cd wtt-web
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin master
```

2. **Import to Vercel**

- Go to [vercel.com](https://vercel.com)
- Click "New Project"
- Import your GitHub repository
- Configure project:
  - Framework Preset: Next.js
  - Root Directory: `./` (or `wtt-web` if in monorepo)
  - Build Command: `npm run build`
  - Output Directory: `.next`

3. **Environment Variables**

Add the following environment variables in Vercel:

```
NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Optional (for future Supabase integration):
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. **Deploy**

Click "Deploy" and wait for the build to complete.

### Custom Domain (Optional)

1. Go to Project Settings > Domains
2. Add your custom domain
3. Configure DNS records as instructed

## Alternative: Docker Deployment

### Build Docker Image

```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
EOF

# Build
docker build -t wtt-web .

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000 \
  wtt-web
```

### Docker Compose

```yaml
version: '3.8'

services:
  wtt-web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_WTT_API_URL=http://170.106.109.4:8000
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
    restart: unless-stopped
```

## VPS Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Build
npm run build

# Start with PM2
pm2 start npm --name "wtt-web" -- start

# Save PM2 configuration
pm2 save
pm2 startup
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Variables

### Required

- `NEXT_PUBLIC_WTT_API_URL`: WTT backend API URL

### Optional

- `NEXT_PUBLIC_APP_URL`: Your app's public URL
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

## CORS Configuration

Ensure WTT backend API allows requests from your web client domain:

```python
# In wtt_service/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-app.vercel.app",
        "https://your-custom-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Monitoring

### Vercel Analytics

Enable Vercel Analytics in Project Settings for:
- Page views
- Performance metrics
- Error tracking

### Custom Monitoring

Add error tracking (e.g., Sentry):

```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

## Troubleshooting

### Build Errors

- Check Node.js version (18+)
- Clear `.next` and `node_modules`, reinstall
- Verify environment variables

### API Connection Issues

- Verify `NEXT_PUBLIC_WTT_API_URL` is correct
- Check CORS configuration on backend
- Test API endpoint directly

### Authentication Issues

- Clear browser localStorage
- Check JWT token expiration
- Verify backend auth endpoints
