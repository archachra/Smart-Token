#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Deploying SmartToken on AWS EC2"
echo "=========================================="

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
echo "Using Node $(node -v) and npm $(npm -v)"

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Build frontend bundle
echo "Building frontend bundle with Vite..."
npm run build

# 4. Check for .env file
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    # Ensure port 3002 to avoid colliding with team website on 3001
    sed -i 's/PORT=3001/PORT=3002/' .env 2>/dev/null || true
    echo "⚠️  Please edit .env and provide your GROQ_API_KEY and GEMINI_API_KEY!"
fi

# 5. Initialize / migrate database
echo "Setting up database tables and Class 3Q13 seed..."
npm run db:setup

# 6. Start or restart with PM2
if command -v pm2 &> /dev/null; then
    echo "Managing process with PM2..."
    pm2 stop smart-token-app 2>/dev/null || true
    pm2 delete smart-token-app 2>/dev/null || true
    PORT=3002 pm2 start server/index.js --name "smart-token-app"
    pm2 save
    echo "SmartToken is running with PM2 on port 3002!"
else
    echo "PM2 not found. You can start the app with:"
    echo "  PORT=3002 npm start"
fi

echo "=========================================="
echo "  Deployment completed successfully!"
echo "=========================================="
