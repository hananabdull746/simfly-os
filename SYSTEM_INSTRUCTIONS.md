# SIMFLY OS - MEGA SYSTEM INSTRUCTIONS
## For LLM Assistants Working on This Project

---

## 1. PROJECT OVERVIEW

**SimFly OS** is a WhatsApp Business Automation Bot built for SimFly Pakistan (eSIM reseller for Non-PTA iPhones).

**Current Version:** v2.0.1
**Tech Stack:** Node.js, whatsapp-web.js, Express, Groq AI API, Puppeteer
**Hosting:** Render (Cloud), Chrome via @sparticuz/chromium
**Alternative:** Railway.com (via railway.json)

### Core Purpose
- Auto-reply to customer WhatsApp messages about eSIM plans
- Process payment screenshots and notify admin
- Provide dashboard for bot control and monitoring
- AI-powered responses using Groq (llama-3.1-8b-instant)

---

## 2. PROJECT STRUCTURE

```
simfly-os/
├── index.js              # Main application file (all code here)
├── railway.json          # Railway.com deployment config
├── .env                  # Environment variables
├── package.json          # Dependencies
├── SYSTEM_INSTRUCTIONS.md # This file
└── .wwebjs_auth/         # WhatsApp session storage
```

**IMPORTANT:** This is a single-file application. ALL logic is in `index.js`.

---

## 3. KEY COMPONENTS

### 3.1 CONFIGURATION (lines 18-36)
```javascript
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ADMIN_NUMBER: process.env.ADMIN_NUMBER,    // Admin WhatsApp number
    RENDER_URL: process.env.RENDER_URL,        // Dashboard URL
    GROQ_API_KEY: process.env.GROQ_API_KEY,    // AI API key
    BUSINESS: { ...pricing, payment methods }
};
```

### 3.2 STATE MANAGEMENT (lines 113-140)
```javascript
const State = {
    startTime: Date.now(),
    totalMessages: 0,
    totalOrders: 0,
    conversations: new Map(),  // chatId -> conversation data
    adminToken: null,          // Dashboard access token
    isReady: false,            // Bot ready status
    qrCodeData: null,          // Current QR code
    aiProvider: 'GROQ',        // 'GROQ' or 'TEMPLATE'
    aiStatus: 'CHECKING',      // 'CHECKING', 'WORKING', 'FAILED'
    settings: {
        autoReply: true,
        sendNotifications: true,
        responseDelay: 1000    // ms delay before reply
    },
    sessionId: null,           // WhatsApp session ID
    clientInfo: { name, platform, connectedAt }
};
```

### 3.3 MESSAGE HANDLING - DUPLICATE PREVENTION (CRITICAL)

**The Problem:** Bot was sending duplicate replies (2 messages for 1 incoming message)

**The Solution:**
```javascript
const processedMessages = new Set();

client.on('message', async (msg) => {
    if (msg.fromMe) return;
    if (!msg.body && !msg.hasMedia) return;

    // STEP 1: Deduplication Check
    const msgId = msg.id?.id || msg.id?._serialized;
    if (msgId && processedMessages.has(msgId)) {
        log(`Skipping duplicate: ${msgId.slice(-8)}`);
        return;
    }
    if (msgId) processedMessages.add(msgId);
    
    // Keep set size manageable (prevent memory leak)
    if (processedMessages.size > 100) {
        const first = processedMessages.values().next().value;
        processedMessages.delete(first);
    }

    // STEP 2: Show Typing Indicator
    let chat = null;
    try {
        chat = await msg.getChat();
        chat.sendStateTyping();  // Shows "typing..." in WhatsApp
    } catch (e) {}

    // STEP 3: "Thinking" Delay (makes it feel natural)
    await new Promise(r => setTimeout(r, 1000));

    // STEP 4: Process Message
    await handleMessage(msg);

    // STEP 5: Clear Typing Indicator
    try {
        if (chat) chat.clearState();
    } catch (e) {}
});
```

**Key Features:**
- **Deduplication:** `processedMessages` Set prevents duplicate replies
- **Typing Indicator:** `chat.sendStateTyping()` shows "typing..."
- **Thinking Delay:** 1 second delay before reply (feels natural)
- **Memory Management:** Max 100 message IDs stored

### 3.4 AI RESPONSE GENERATION (lines 212-252)
```javascript
async function generateResponse(userMsg) {
    // 1. Check template keywords first
    if (msg.includes('hi') || msg.includes('hello')) return TEMPLATES.welcome;
    if (msg.includes('price') || msg.includes('plan')) return TEMPLATES.pricing;
    if (msg.includes('payment')) return TEMPLATES.payment;

    // 2. Fallback to Groq AI
    if (State.aiProvider === 'GROQ' && State.aiStatus === 'WORKING') {
        const chat = await groqClient.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMsg }
            ]
        });
        return chat.choices[0].message.content;
    }

    // 3. Final fallback
    return TEMPLATES.default;
}
```

### 3.5 DASHBOARD SYSTEM (lines 307-746)

**Routes:**
- `GET /` - Health check
- `GET /setup` - QR code scanning page
- `GET /dashboard/:token` - Admin dashboard (protected)
- `GET /api/status` - Bot status JSON
- `POST /api/settings` - Update settings
- `POST /api/send-test` - Send test message
- `POST /api/reconnect` - Reconnect WhatsApp

**Dashboard Features:**
- Real-time stats (uptime, messages, orders, chats)
- Toggle auto-reply
- Change AI provider (Groq/Templates)
- Adjust response delay
- View logs
- Send test messages
- Reconnect WhatsApp

### 3.6 WHATSAPP CLIENT (lines 852-930)

**Events:**
- `qr` - QR code generated for scanning
- `authenticated` - Session authenticated
- `ready` - Bot fully ready
- `message` - New message received (SINGLE handler only!)
- `disconnected` - Connection lost

**Puppeteer Config:**
```javascript
{
    headless: chromium.headless,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process']
}
```

---

## 4. PRICING & BUSINESS RULES

### eSIM Plans
| Plan | Data | Price | Validity |
|------|------|-------|----------|
| STARTER | 500MB | Rs. 130 | 2 Years |
| POPULAR | 1GB | Rs. 400 | 2 Years (MOST SELLING) |
| MEGA | 5GB | Rs. 1500 | 4 Devices |

### Payment Methods
- **Easypaisa:** 03466544374 (Shafqat)
- **JazzCash:** 03456754090 (Shafqat)
- **SadaPay:** 03116400376 (Abdullah Saahi)

**IMPORTANT:** When mentioning SadaPay, always note "Abdullah Saahi" will show as recipient name.

---

## 5. AI SYSTEM PROMPT

```javascript
const DEFAULT_SYSTEM_PROMPT = `You are a friendly Sales Manager at SimFly Pakistan (eSIM for Non-PTA iPhones).

Use Roman Urdu/Hinglish with emojis. Be friendly but professional.

PRICING:
⚡ STARTER: 500MB @ Rs. 130 (2 years)
🔥 POPULAR: 1GB @ Rs. 400 (2 years) - MOST POPULAR
💎 MEGA: 5GB @ Rs. 1500 (4 devices)

PAYMENT:
💳 Easypaisa: 03466544374 (Shafqat)
💳 JazzCash: 03456754090 (Shafqat)
💳 SadaPay: 03116400376 (Abdullah Saahi)

STRICT RULES:
1. Use emojis in every response
2. Keep replies SHORT (max 3-4 lines)
3. No markdown (*, **, _, #)
4. No discounts
5. Focus on closing sales
6. If asked about NON-BUSINESS topics, reply: "Sorry bhai, main sirf SimFly Pakistan ke eSIM plans ke bare mein help kar sakta hoon. 😊"
7. Always stay on topic - eSIM, pricing, payment, activation`;
```

---

## 6. GROQ AI LIMITS (Free Tier)

- **1 Million tokens per day**
- **20 requests per minute**
- **Model:** llama-3.1-8b-instant
- **Fallback:** Template responses if limits reached

---

## 7. COMMON ISSUES & FIXES

### Issue: Duplicate Replies (FIXED ✅)
**Cause:** Multiple event listeners (`message` + `message_create`)
**Fix:** 
1. Use ONLY ONE event listener (`message`)
2. Implement `processedMessages` Set for deduplication
3. Check message ID before processing

### Issue: Typing Indicator Not Showing
**Fix:** Must get chat object first:
```javascript
const chat = await msg.getChat();
await chat.sendStateTyping();
// ... process message ...
await chat.clearState();
```

### Issue: Bot Not Responding
**Check:**
1. `State.isReady` is true
2. `State.settings.autoReply` is true
3. `client` is initialized
4. Message handler is registered

### Issue: QR Code Not Scanning
**Fix:**
- Ensure phone has good internet
- Try "Link Device" instead of "Link a Device"
- Refresh page after 5 seconds (auto-refresh enabled)

### Issue: Admin Notification Not Sending
**Fix:** Check `client.sendMessage` exists before calling
```javascript
if (!client.sendMessage) {
    await new Promise(r => setTimeout(r, 3000));
    continue;
}
```

---

## 8. USER COMMUNICATION STYLE

The user (hananabdull746) prefers:
- **Language:** Mix of English and Roman Urdu (Urdu written in Latin script)
- **Tone:** Friendly, "bhai" style (casual Pakistani)
- **Responses:** Concise, emoji-rich, action-oriented
- **Git:** Commit with version tags (e.g., "v2.0.1: Fixed notification")

**Example:**
- Instead of "I will fix this" → "Bhai fix kar raha hoon!"
- Instead of "The issue is resolved" → "Done bhai! Push ho gaya! ✅"

---

## 9. DEPLOYMENT

### Render.com (Primary)
1. Create Web Service → Connect GitHub repo
2. Environment Variables:
   - `GROQ_API_KEY`
   - `ADMIN_NUMBER`
   - `RENDER_URL`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Deploy

### Railway.com (Alternative)
1. Create Project → Connect repo
2. Add same variables + `RAILWAY_URL`
3. Railway reads `railway.json` automatically:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm install" },
  "deploy": { 
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE"
  }
}
```
4. Deploy

---

## 10. IMPORTANT CODE PATTERNS

### Adding New Feature
```javascript
// 1. Add to State if needed
const State = {
    ...existing,
    newFeature: null
};

// 2. Create handler function
async function handleNewFeature(data) {
    log('Processing new feature...');
    // implementation
}

// 3. Add API endpoint if needed
app.post('/api/new-feature', async (req, res) => {
    const result = await handleNewFeature(req.body);
    res.json({ success: true, result });
});
```

### Sending WhatsApp Message
```javascript
const chatId = `${number}@c.us`;
const sent = await client.sendMessage(chatId, message);
if (sent && sent.id) {
    log(`Message sent: ${sent.id.id}`);
}
```

### Getting Chat Object (for typing indicator)
```javascript
const chat = await message.getChat();
await chat.sendStateTyping();     // Show typing
await chat.clearState();          // Stop typing
await chat.sendStateRecording();  // Show recording (voice)
```

---

## 11. SECURITY NOTES

- **Admin Token:** Random 8-char token for dashboard access
- **Session Storage:** `.wwebjs_auth/` contains WhatsApp session
- **ENV Variables:** Never commit `.env` file
- **QR Code:** Expires after 60 seconds, auto-regenerates
- **Message Deduplication:** Prevents duplicate processing

---

## 12. FUTURE ENHANCEMENTS ROADMAP

1. **Multi-language Support:** Add English/Urdu detection
2. **Order Tracking:** Database integration for order history
3. **Broadcast Messages:** Send promos to all chats
4. **Analytics:** Daily/weekly stats export
5. **Auto-restart:** On crash detection
6. **Backup:** Session backup to cloud storage

---

## 13. QUICK REFERENCE

### Run Locally
```bash
npm install
node index.js
```

### Environment Variables
```env
GROQ_API_KEY=your_key_here
ADMIN_NUMBER=923001234567
RENDER_URL=https://your-app.onrender.com
```

### Dependencies
```json
{
    "whatsapp-web.js": "latest",
    "express": "^4.x",
    "groq-sdk": "latest",
    "puppeteer": "^19.x",
    "@sparticuz/chromium": "latest",
    "qrcode-terminal": "latest"
}
```

---

## 14. WHAT WAS FIXED IN LATEST UPDATE

1. ✅ **Duplicate Replies:** Added `processedMessages` Set to track and skip already-processed messages
2. ✅ **Typing Indicator:** Added `chat.sendStateTyping()` before reply and `chat.clearState()` after
3. ✅ **Thinking Delay:** 1-second delay makes bot feel more natural
4. ✅ **Railway Support:** Added `railway.json` for Railway.com deployment
5. ✅ **Session Tracking:** Stores WhatsApp session ID and client info

---

## 15. CONTACT & SUPPORT

- **Developer:** hananabdull746
- **Business:** SimFly Pakistan
- **Admin Numbers:** Configured in `CONFIG.ADMIN_NUMBER`

---

**END OF SYSTEM INSTRUCTIONS**

Last Updated: 2026-04-02
Version: v2.1.0
