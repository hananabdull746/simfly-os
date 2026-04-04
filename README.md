# SimFly OS v6.0 - Simple .env Edition

Production-Ready WhatsApp Sales Bot with AI Integration for SimFly Pakistan (eSIM Provider).

## 🚀 Quick Setup (Only .env file needed!)

### Step 1: Create .env file
Create a `.env` file in the root folder:

```env
# WhatsApp Admin Number (your number with country code, no +)
ADMIN_NUMBER=923001234567

# Groq AI API Key (optional - get from https://console.groq.com)
# Leave empty if you don't have one
GROQ_API_KEY=

# Firebase Service Account (optional - for cloud database)
# Leave empty to use local JSON database
FIREBASE_SERVICE_ACCOUNT=

# Server Port
PORT=3000
```

### Step 2: Deploy to Railway

```bash
railway login
railway link
railway up
```

### Step 3: Add .env to Railway Dashboard
Go to Railway Dashboard → Your Project → Variables → Raw Editor

Paste your .env content there and deploy!

## ✨ Features

✅ **Simple Setup** - Works with just .env file, no complex configuration
✅ **Smart AI** - Uses Groq AI if key provided, otherwise smart template responses
✅ **Auto Database** - Firebase if configured, otherwise local JSON (auto-saves)
✅ **Multiple Responses** - Different reply for every message
✅ **Real-time Dashboard** - See QR code, logs, and stats

## 🔧 How it Works

### Without Groq API Key:
- Bot uses smart template responses
- Keyword-based intelligent replies
- Works perfectly for sales

### Without Firebase:
- Data saves to `data/database.json`
- Persists between restarts
- Auto-backup every 30 seconds

## 📊 Dashboard

Visit your Railway URL to see:
- QR Code for WhatsApp connection
- Real-time logs
- Message/Order/User stats
- AI and Database status

## 🔌 API Endpoints

- `GET /health` - Health check
- `GET /api/status` - Full status with QR, logs, stats
- `POST /api/send` - Send WhatsApp message via API

## 🧠 Need AI?

Get free Groq API key: https://console.groq.com

Add to .env:
```env
GROQ_API_KEY=gsk_your_key_here
```

## 🔥 Need Firebase?

1. Go to https://console.firebase.google.com
2. Create project → Settings → Service Accounts
3. Generate new private key
4. Convert to base64:
```bash
base64 serviceAccount.json
```
5. Add to .env:
```env
FIREBASE_SERVICE_ACCOUNT=eyJ0eXBl...
```

## 📝 Example .env with all features

```env
ADMIN_NUMBER=923001234567
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
FIREBASE_SERVICE_ACCOUNT=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50...
PORT=3000
```

---

**Built for Railway.com | Works without external setup | v6.0 Simple .env Edition**
