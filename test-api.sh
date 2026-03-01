#!/bin/bash

# WTT Web - API Connection Test

API_URL="${NEXT_PUBLIC_WTT_API_URL:-http://170.106.109.4:8000}"

echo "🔍 Testing WTT API connection..."
echo "API URL: $API_URL"
echo ""

# Test health endpoint
echo "1. Testing API health..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null)

if [ "$response" = "200" ]; then
    echo "✅ API is healthy (HTTP $response)"
else
    echo "⚠️  API health check failed (HTTP $response)"
fi

# Test topics endpoint
echo ""
echo "2. Testing topics endpoint..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/topics/" 2>/dev/null)

if [ "$response" = "200" ]; then
    echo "✅ Topics endpoint accessible (HTTP $response)"

    # Get topic count
    count=$(curl -s "$API_URL/topics/" | grep -o "\"id\"" | wc -l)
    echo "   Found $count public topics"
else
    echo "⚠️  Topics endpoint failed (HTTP $response)"
fi

echo ""
echo "3. CORS Configuration Check"
echo "   Make sure WTT backend allows:"
echo "   - http://localhost:3000 (development)"
echo "   - Your Vercel domain (production)"

echo ""
echo "✅ API connection test complete!"
echo ""
echo "To start the web client:"
echo "  npm run dev"
echo "  or"
echo "  ./start.sh"
