#!/bin/bash

# WTT Web Quick Start Script

echo "🚀 Starting WTT Web Client..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local not found. Creating from .env.example..."
    cp .env.example .env.local
    echo "✅ Created .env.local. Please update with your configuration."
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start development server
echo "🌐 Starting development server on http://localhost:3000"
npm run dev
