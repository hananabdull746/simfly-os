# Northflank Deployment Guide - SimFly OS

## Step 1: Account Creation

1. Go to https://northflank.com
2. Click "Sign Up"
3. Use GitHub login (easiest) or email
4. No credit card required for free tier!

## Step 2: Create Project

1. Click "Create Project"
2. Name: `simfly-bot`
3. Select region: `Asia (Mumbai)` - closest to Pakistan
4. Click "Create"

## Step 3: Add Service

1. Click "Create Service"
2. Select "Git Repository"
3. Connect GitHub account
4. Select repo: `hananabdull746/simfly-os`
5. Branch: `main`

## Step 4: Build Configuration

**Build Type:** `Dockerfile`

The Dockerfile is already in the repo, but verify settings:

**Dockerfile Path:** `Dockerfile`
**Build Context:** `/`
**Target Port:** `3000`

## Step 5: Environment Variables

Click "Environment" tab, add these:

```
GROQ_API_KEY=your_actual_key_here
ADMIN_NUMBER=923057258561
PORT=3000
NODE_ENV=production
```

## Step 6: Resource Configuration

**Runtime:**
- vCPU: 0.5 (minimum)
- Memory: 512 MB (minimum)
- Instances: 1

**Important Settings:**
- Auto-deploy: ON (on git push)
- Health check path: `/`
- Port: 3000

## Step 7: Deploy

Click "Deploy" button!

## Step 8: Get Logs (QR Code)

1. Click on your service
2. Go to "Logs" tab
3. Wait for QR code to appear
4. Scan with WhatsApp

## Step 9: Get URL

1. Service details mein "Networking" section
2. Your URL will be: `https://simfly-bot-[project-id].nf-k8s.northflank.com/`
3. Dashboard access: `https://simfly-bot-[project-id].nf-k8s.northflank.com/dashboard/[TOKEN]`

## Free Tier Limits

- 2 projects free
- Shared CPU
- Community support
- No time limits!

## Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Verify package.json is valid

### QR Not Showing
- Check logs in "Logs" tab
- Restart service from dashboard

### Bot Not Responding
- Check environment variables
- Verify GROQ_API_KEY is correct
- Check logs for errors

## Commands (Optional)

Install Northflank CLI:
```bash
npm install -g @northflank/cli
```

Login:
```bash
nf login
```

View logs:
```bash
nf logs simfly-bot
```

## Success! 🎉

Your bot is now running 24/7 on Northflank!

---

*Last Updated: 2026-04-02*
