/**
 * SIMFLY OS v6.0 - SIMPLE .ENV EDITION
 * Works with just .env file - no external setup needed
 */

require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

// ============================================
// CONFIG FROM .ENV FILE ONLY
// ============================================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    ADMIN_NUMBER: process.env.ADMIN_NUMBER || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || ''
};

// ============================================
// GROQ AI SETUP (Optional)
// ============================================
let groqClient = null;
if (CONFIG.GROQ_API_KEY && CONFIG.GROQ_API_KEY.length > 10) {
    try {
        const Groq = require('groq-sdk');
        groqClient = new Groq({ apiKey: CONFIG.GROQ_API_KEY });
        console.log('✓ Groq AI: ENABLED');
    } catch (e) {
        console.log('⚠ Groq AI: Failed to load');
    }
} else {
    console.log('⚠ Groq AI: DISABLED (add GROQ_API_KEY to .env)');
}

// AI System Prompt
const SYSTEM_PROMPT = `You are SimFly Pakistan's WhatsApp Sales Assistant.

BUSINESS INFO:
- SimFly Pakistan sells eSIM for Non-PTA iPhones
- Location: Pakistan
- Reply in Roman Urdu + English mix
- Use emojis in every response
- Keep replies SHORT (2-3 lines max)

ESIM PLANS:
⚡ 500MB @ Rs. 130 (2 years)
🔥 1GB @ Rs. 400 (Most Popular)
💎 5GB @ Rs. 1500 (4 devices)

PAYMENT:
💳 Easypaisa: 03466544374
💳 JazzCash: 03456754090
💳 SadaPay: 03116400376

RULES:
1. Be friendly Pakistani bhai style
2. No discounts
3. Focus on closing sales
4. Non-business topics: "Sorry bhai, main sirf SimFly ke eSIM plans ke bare mein help kar sakta hoon. 😊"`;

// ============================================
// FIREBASE SETUP (Optional - from .env)
// ============================================
let db = null;
let firebaseInitialized = false;

if (CONFIG.FIREBASE_SERVICE_ACCOUNT && CONFIG.FIREBASE_SERVICE_ACCOUNT.length > 50) {
    try {
        const admin = require('firebase-admin');
        const serviceAccount = JSON.parse(Buffer.from(CONFIG.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());

        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        db = admin.firestore();
        firebaseInitialized = true;
        console.log('✓ Firebase: CONNECTED');
    } catch (e) {
        console.log('⚠ Firebase: Failed -', e.message);
    }
}

if (!firebaseInitialized) {
    console.log('✓ Using local JSON database (data/database.json)');
}

// ============================================
// LOCAL DATABASE (Always works)
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB = {
    conversations: {},
    stats: { totalMessages: 0, totalOrders: 0 },
    users: {}
};

// Load from file
const DB_FILE = path.join(DATA_DIR, 'database.json');
if (fs.existsSync(DB_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        Object.assign(DB, data);
        console.log('✓ Database loaded from file');
    } catch (e) {}
}

// Save every 30 seconds
setInterval(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
}, 30000);

// ============================================
// DATABASE FUNCTIONS
// ============================================
async function saveMessage(chatId, message) {
    // Save to Firebase
    if (firebaseInitialized) {
        try {
            const admin = require('firebase-admin');
            const ref = db.collection('conversations').doc(chatId);
            const doc = await ref.get();
            let messages = doc.exists ? (doc.data().messages || []) : [];
            messages.push(message);
            if (messages.length > 50) messages = messages.slice(-50);
            await ref.set({ messages, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (e) {}
    }

    // Save locally
    if (!DB.conversations[chatId]) DB.conversations[chatId] = [];
    DB.conversations[chatId].push(message);
    if (DB.conversations[chatId].length > 50) {
        DB.conversations[chatId] = DB.conversations[chatId].slice(-50);
    }
}

async function getHistory(chatId) {
    if (firebaseInitialized) {
        try {
            const doc = await db.collection('conversations').doc(chatId).get();
            if (doc.exists) return doc.data().messages || [];
        } catch (e) {}
    }
    return DB.conversations[chatId] || [];
}

// ============================================
// STATE
// ============================================
const State = {
    isReady: false,
    status: 'INITIALIZING',
    qrData: null,
    logs: [],
    startTime: Date.now()
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };
    State.logs.unshift(entry);
    if (State.logs.length > 50) State.logs.pop();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// AI RESPONSES
// ============================================
async function getAIResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // Quick responses (no API needed)
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam')) {
        return `Assalam-o-Alaikum! 👋 SimFly Pakistan mein khush amdeed!\n\nMain aapki kya madad kar sakta hoon? 😊`;
    }

    if (msg.includes('price') || msg.includes('plan') || msg.includes('kitne') || msg.includes('rate')) {
        return `Hamare eSIM Plans:\n\n⚡ 500MB - Rs. 130\n🔥 1GB - Rs. 400 (Most Popular)\n💎 5GB - Rs. 1500\n\nKaunsa plan pasand hai? 🤔`;
    }

    if (msg.includes('payment') || msg.includes('pay') || msg.includes('jazzcash') || msg.includes('easypaisa')) {
        return `Payment Methods:\n\n💳 Easypaisa: 03466544374\n💳 JazzCash: 03456754090\n💳 SadaPay: 03116400376\n\nPayment karne ke baad screenshot bhejain! 📱`;
    }

    // Try Groq AI if available
    if (groqClient && CONFIG.GROQ_API_KEY) {
        try {
            const history = await getHistory(chatId);
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history.slice(-3).map(m => ({
                    role: m.fromMe ? 'assistant' : 'user',
                    content: m.body
                })),
                { role: 'user', content: userMessage }
            ];

            const response = await groqClient.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: messages,
                max_tokens: 400,
                temperature: 0.7
            });

            if (response?.choices?.[0]) {
                return response.choices[0].message.content;
            }
        } catch (e) {
            log('Groq API error: ' + e.message, 'error');
        }
    }

    // Fallback responses
    if (msg.includes('order') || msg.includes('buy')) {
        return `Order karne ke liye:\n\n1️⃣ Plan select karein\n2️⃣ Payment karein\n3️⃣ Screenshot bhejain\n\nAap kaunsa plan lena chahte hain? 📦`;
    }

    if (msg.includes('thank') || msg.includes('shukria')) {
        return `Koi baat nahi! 😊 Agar koi aur sawal ho toh pooch sakte hain! 👍`;
    }

    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?`;
}

// ============================================
// WHATSAPP CLIENT
// ============================================
let client = null;

async function startWhatsApp() {
    if (client) return;

    log('Starting WhatsApp...');
    State.status = 'INITIALIZING';

    try {
        const authPath = '/app/.wwebjs_auth';
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        let executablePath = null;
        try {
            executablePath = await chromium.executablePath();
        } catch (e) {}

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath, clientId: 'simfly' }),
            puppeteer: {
                headless: 'new',
                executablePath: executablePath || undefined,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
            }
        });

        client.on('qr', (qr) => {
            log('QR Code generated');
            State.status = 'QR';
            State.qrData = qr;
            console.log('\n=== SCAN THIS QR CODE ===\n');
            qrcode.generate(qr, { small: true });
        });

        client.on('authenticated', () => {
            log('Authenticated ✓');
            State.status = 'AUTHENTICATED';
        });

        client.on('ready', () => {
            log('WhatsApp READY! ✓');
            State.isReady = true;
            State.status = 'READY';
            State.qrData = null;

            // Notify admin
            if (CONFIG.ADMIN_NUMBER) {
                try {
                    const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                    client.sendMessage(adminChat, `🤖 SimFly Bot ONLINE! ✅\n\nAI: ${groqClient ? 'ON' : 'OFF'}\nDatabase: ${firebaseInitialized ? 'Firebase' : 'Local'}\nReady for messages!`);
                } catch (e) {}
            }
        });

        client.on('disconnected', (reason) => {
            log('Disconnected: ' + reason, 'error');
            State.isReady = false;
            State.status = 'INITIALIZING';
            client = null;
            setTimeout(startWhatsApp, 5000);
        });

        // MESSAGE HANDLER
        client.on('message_create', async (msg) => {
            if (msg.fromMe) return;

            const chatId = msg.from;
            const body = msg.body;

            log(`[${chatId}] ${body.slice(0, 40)}`);

            // Save to database
            await saveMessage(chatId, { body, fromMe: false, time: Date.now() });
            DB.stats.totalMessages++;

            // Track user
            if (!DB.users[chatId]) {
                DB.users[chatId] = { firstSeen: Date.now(), messages: 0 };
            }
            DB.users[chatId].messages++;
            DB.users[chatId].lastSeen = Date.now();

            if (!State.isReady) return;

            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();

                // Get AI response
                const reply = await getAIResponse(body, chatId);

                await new Promise(r => setTimeout(r, 1000));
                const sent = await msg.reply(reply);
                await chat.clearState();

                // Save bot response
                if (sent) {
                    await saveMessage(chatId, { body: reply, fromMe: true, time: Date.now() });
                }

                // Check for payment
                if (msg.hasMedia && (body.includes('payment') || body.includes('screenshot'))) {
                    DB.stats.totalOrders++;
                    if (CONFIG.ADMIN_NUMBER) {
                        try {
                            const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                            client.sendMessage(adminChat, `💰 Payment from: ${chatId}`);
                        } catch (e) {}
                    }
                }

            } catch (e) {
                log('Reply error: ' + e.message, 'error');
            }
        });

        await client.initialize();
        log('Client initialized');

    } catch (error) {
        log('Start error: ' + error.message, 'error');
        setTimeout(startWhatsApp, 10000);
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ ok: true, status: State.status, ready: State.isReady });
});

// Status API
app.get('/api/status', (req, res) => {
    res.json({
        status: State.status,
        ready: State.isReady,
        qr: State.qrData,
        stats: DB.stats,
        users: Object.keys(DB.users).length,
        logs: State.logs.slice(0, 15),
        groq: !!groqClient,
        firebase: firebaseInitialized
    });
});

// Main page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SimFly OS v6.0</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; min-height: 100vh; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 0; }
        .logo { font-size: 3rem; }
        .title { font-size: 2rem; font-weight: bold; background: linear-gradient(45deg, #ff6b6b, #feca57); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 16px 0; }
        .status-box { text-align: center; }
        .status-icon { font-size: 3rem; margin-bottom: 10px; }
        .status-title { font-size: 1.3rem; font-weight: 600; }
        .status-text { color: #888; font-size: 0.9rem; margin-top: 5px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; margin: 5px; }
        .badge-green { background: #2ecc71; color: #000; }
        .badge-red { background: #e74c3c; }
        .badge-yellow { background: #f39c12; color: #000; }
        .loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .qr-box { background: #fff; border-radius: 12px; padding: 20px; text-align: center; display: none; }
        .qr-box.show { display: block; }
        #qrcode { margin: 0 auto; }
        .success-box { text-align: center; display: none; }
        .success-box.show { display: block; }
        .logs { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; }
        .log-item { padding: 4px 0; color: #aaa; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-item:last-child { border-bottom: none; color: #2ecc71; }
        .log-time { color: #666; margin-right: 8px; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .stat-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: bold; color: #feca57; }
        .stat-label { font-size: 0.8rem; color: #888; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">SimFly OS v6.0</div>
            <div style="color: #888; margin-top: 5px;">Simple .env Edition</div>
            <div style="margin-top: 10px;">
                <span class="badge" id="aiBadge">Checking...</span>
                <span class="badge" id="dbBadge">Checking...</span>
            </div>
        </div>

        <div class="card">
            <div class="status-box" id="statusBox">
                <div class="status-icon" id="statusIcon">⏳</div>
                <div class="status-title" id="statusTitle">Initializing</div>
                <div class="status-text" id="statusText">Starting WhatsApp...</div>
                <div class="loader" id="loader"></div>
            </div>

            <div class="qr-box" id="qrCard">
                <div style="color: #333; font-weight: bold; margin-bottom: 15px;">📱 Scan with WhatsApp</div>
                <div id="qrcode"></div>
                <div style="color: #666; font-size: 0.85rem; margin-top: 15px;">Settings → Linked Devices → Link a Device</div>
            </div>

            <div class="success-box" id="successCard">
                <div class="status-icon">✅</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #2ecc71;">Connected!</div>
                <div style="color: #888; margin-top: 5px;">Bot is ready for messages</div>
            </div>
        </div>

        <div class="card">
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-num" id="msgCount">0</div>
                    <div class="stat-label">Messages</div>
                </div>
                <div class="stat-box">
                    <div class="stat-num" id="orderCount">0</div>
                    <div class="stat-label">Orders</div>
                </div>
                <div class="stat-box">
                    <div class="stat-num" id="userCount">0</div>
                    <div class="stat-label">Users</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 10px;">📋 Real-time Logs</div>
            <div class="logs" id="logsBox">
                <div class="log-item"><span class="log-time">--:--</span> Waiting...</div>
            </div>
        </div>

        <div class="footer">Works with .env file | No external setup needed</div>
    </div>

    <script>
        const els = {
            statusIcon: document.getElementById('statusIcon'),
            statusTitle: document.getElementById('statusTitle'),
            statusText: document.getElementById('statusText'),
            loader: document.getElementById('loader'),
            qrCard: document.getElementById('qrCard'),
            successCard: document.getElementById('successCard'),
            logsBox: document.getElementById('logsBox'),
            aiBadge: document.getElementById('aiBadge'),
            dbBadge: document.getElementById('dbBadge')
        };

        let currentQR = null;

        function updateUI(data) {
            els.aiBadge.className = 'badge ' + (data.groq ? 'badge-green' : 'badge-red');
            els.aiBadge.textContent = data.groq ? 'AI: ON' : 'AI: OFF';
            els.dbBadge.className = 'badge ' + (data.firebase ? 'badge-green' : 'badge-yellow');
            els.dbBadge.textContent = data.firebase ? 'DB: FIREBASE' : 'DB: LOCAL';

            document.getElementById('msgCount').textContent = data.stats?.totalMessages || 0;
            document.getElementById('orderCount').textContent = data.stats?.totalOrders || 0;
            document.getElementById('userCount').textContent = data.users || 0;

            if (data.logs?.length > 0) {
                els.logsBox.innerHTML = data.logs.map(l =>
                    '<div class="log-item"><span class="log-time">' + l.time + '</span> ' + l.msg + '</div>'
                ).join('');
            }

            switch(data.status) {
                case 'INITIALIZING':
                    els.statusIcon.textContent = '⏳';
                    els.statusTitle.textContent = 'Initializing';
                    els.statusText.textContent = 'Starting WhatsApp...';
                    els.loader.style.display = 'block';
                    els.qrCard.classList.remove('show');
                    els.successCard.classList.remove('show');
                    break;
                case 'QR':
                    els.statusIcon.textContent = '📱';
                    els.statusTitle.textContent = 'Scan QR Code';
                    els.statusText.textContent = 'Open WhatsApp on phone';
                    els.loader.style.display = 'none';
                    if (data.qr && data.qr !== currentQR) {
                        currentQR = data.qr;
                        els.qrCard.classList.add('show');
                        document.getElementById('qrcode').innerHTML = '';
                        new QRCode(document.getElementById('qrcode'), { text: data.qr, width: 200, height: 200 });
                    }
                    break;
                case 'AUTHENTICATED':
                    els.statusIcon.textContent = '🔐';
                    els.statusTitle.textContent = 'Authenticating...';
                    els.qrCard.classList.remove('show');
                    break;
                case 'READY':
                    els.statusIcon.textContent = '✅';
                    els.statusTitle.textContent = 'Connected!';
                    els.statusText.textContent = 'Bot is ready';
                    els.loader.style.display = 'none';
                    els.qrCard.classList.remove('show');
                    els.successCard.classList.add('show');
                    break;
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status?t=' + Date.now());
                updateUI(await res.json());
            } catch (e) { console.error(e); }
        }

        fetchStatus();
        setInterval(fetchStatus, 2000);
    </script>
</body>
</html>`);
});

// Start server
const server = app.listen(CONFIG.PORT, () => {
    log('='.repeat(50));
    log('SimFly OS v6.0 - Simple .env Edition');
    log('Port: ' + CONFIG.PORT);
    log('AI: ' + (groqClient ? 'ENABLED' : 'TEMPLATE MODE'));
    log('DB: ' + (firebaseInitialized ? 'FIREBASE' : 'LOCAL JSON'));
    log('='.repeat(50));
    setTimeout(startWhatsApp, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
