/**
 * SIMFLY OS v7.0 - CONFIG.JS EDITION
 * No .env file needed, no Firebase, everything in config.js
 */

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

// Import all configuration from config.js
const { CONFIG, BUSINESS, SYSTEM_PROMPT, KEYWORD_RESPONSES, PUPPETEER_CONFIG, DB_CONFIG, BOT_CONFIG } = require('./config');

// ============================================
// LOCAL DATABASE (JSON File Only - No Firebase)
// ============================================
const DATA_DIR = path.join(__dirname, DB_CONFIG.dataDir);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB = {
    conversations: {},
    stats: { totalMessages: 0, totalOrders: 0 },
    users: {},
    orders: []
};

// Load from file
const DB_FILE = path.join(DATA_DIR, DB_CONFIG.dbFile);
if (fs.existsSync(DB_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        Object.assign(DB, data);
        console.log('✓ Database loaded from file');
    } catch (e) {
        console.log('⚠ Database load failed, starting fresh');
    }
}

// Save every 30 seconds
setInterval(() => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
    } catch (e) {
        console.error('Failed to save database:', e.message);
    }
}, DB_CONFIG.saveInterval);

// ============================================
// DATABASE FUNCTIONS
// ============================================
async function saveMessage(chatId, message) {
    if (!DB.conversations[chatId]) DB.conversations[chatId] = [];
    DB.conversations[chatId].push(message);
    if (DB.conversations[chatId].length > DB_CONFIG.maxMessagesPerChat) {
        DB.conversations[chatId] = DB.conversations[chatId].slice(-DB_CONFIG.maxMessagesPerChat);
    }
}

async function getHistory(chatId) {
    return DB.conversations[chatId] || [];
}

function addOrder(orderData) {
    const order = {
        id: Date.now().toString(36),
        ...orderData,
        createdAt: Date.now(),
        status: 'pending'
    };
    DB.orders.push(order);
    DB.stats.totalOrders++;
    return order;
}

function getOrders(chatId) {
    return DB.orders.filter(o => o.chatId === chatId);
}

// ============================================
// STATE
// ============================================
const State = {
    isReady: false,
    status: 'INITIALIZING',
    qrData: null,
    logs: [],
    startTime: Date.now(),
    processedMessages: new Set() // Deduplication
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };
    State.logs.unshift(entry);
    if (State.logs.length > DB_CONFIG.maxLogs) State.logs.pop();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// KEYWORD MATCHING
// ============================================
function findKeywordResponse(userMessage) {
    const msg = userMessage.toLowerCase();

    for (const [category, data] of Object.entries(KEYWORD_RESPONSES)) {
        for (const keyword of data.keywords) {
            if (msg.includes(keyword.toLowerCase())) {
                // Return random response from available responses
                const responses = data.responses;
                return responses[Math.floor(Math.random() * responses.length)];
            }
        }
    }
    return null;
}

function findFAQResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    for (const [keyword, answer] of Object.entries(BUSINESS.faqs)) {
        if (msg.includes(keyword.toLowerCase())) {
            return answer;
        }
    }
    return null;
}

// ============================================
// AI RESPONSE GENERATION (Template-based only)
// ============================================
async function getAIResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // 1. Check for greetings
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('salam') || msg.includes('hey')) {
        return findKeywordResponse(userMessage) || `Assalam-o-Alaikum bhai! 👋 SimFly Pakistan mein khush amdeed! Main aapki kya madad kar sakta hoon? 😊`;
    }

    // 2. Check FAQ first
    const faqResponse = findFAQResponse(userMessage);
    if (faqResponse) return faqResponse;

    // 3. Check keyword responses
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // 4. Context-based responses
    const history = await getHistory(chatId);

    // Check if user mentioned a plan
    if (msg.includes('500mb')) {
        return `500MB plan Rs. 130 mein hai bhai! ⚡ 2 saal ki validity hai.\n\nPayment karne ke liye ready hain? 💳`;
    }
    if (msg.includes('1gb')) {
        return `1GB plan Rs. 400 (Most Popular) 🔥\n\n2 saal ki validity, zabardast deal hai!\n\nLena hai bhai? 📱`;
    }
    if (msg.includes('5gb')) {
        return `5GB plan Rs. 1500 mein hai bhai! 💎 4 devices pe use kar sakte hain.\n\nFamily ke liye perfect hai! 👨‍👩‍👧‍👦\n\nOrder karein?`;
    }

    // Check if asking about payment
    if (msg.includes('pay') || msg.includes('send') || msg.includes('bhejo') || msg.includes('transfer')) {
        return `Payment Methods:\n\n💳 EasyPaisa: ${BUSINESS.payments.easypaisa.number}\n💳 JazzCash: ${BUSINESS.payments.jazzcash.number}\n💳 SadaPay: ${BUSINESS.payments.sadapay.number}\n\nPayment karke screenshot bhej dein bhai! 📱`;
    }

    // Check if asking for order status
    if (msg.includes('status') || msg.includes('order') || msg.includes('kahan')) {
        return `Bhai order ke liye:\n\n1️⃣ Plan select karein\n2️⃣ Payment karein\n3️⃣ Screenshot bhej dein\n\nMain foran process kar deta hoon! ⚡`;
    }

    // Default fallback response
    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?\n\nYa "help" likh dein! 👍`;
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
        const authPath = path.join(__dirname, '.wwebjs_auth');
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        let executablePath = null;
        try {
            executablePath = await chromium.executablePath();
        } catch (e) {
            console.log('Chromium executable not found, using default');
        }

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath, clientId: 'simfly' }),
            puppeteer: {
                headless: PUPPETEER_CONFIG.headless,
                executablePath: executablePath || undefined,
                args: PUPPETEER_CONFIG.args
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
                setTimeout(async () => {
                    try {
                        const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `🤖 ${CONFIG.BOT_NAME} ONLINE! ✅\n\n📊 Stats: ${DB.stats.totalMessages} messages, ${DB.stats.totalOrders} orders\n⏱️ Uptime: ${Math.floor((Date.now() - State.startTime) / 1000)}s\n\nReady for customers! 🚀`);
                        log('Admin notified');
                    } catch (e) {
                        log('Failed to notify admin: ' + e.message, 'error');
                    }
                }, 3000);
            }
        });

        client.on('disconnected', (reason) => {
            log('Disconnected: ' + reason, 'error');
            State.isReady = false;
            State.status = 'DISCONNECTED';
            client = null;
            setTimeout(startWhatsApp, 5000);
        });

        // MESSAGE HANDLER
        client.on('message_create', async (msg) => {
            // Skip own messages
            if (msg.fromMe) return;

            const chatId = msg.from;
            const body = msg.body;

            // Deduplication: Check if already processed
            const msgId = msg.id?.id || msg.id?._serialized;
            if (msgId && State.processedMessages.has(msgId)) {
                log(`Skipping duplicate: ${msgId.slice(-8)}`);
                return;
            }
            if (msgId) State.processedMessages.add(msgId);

            // Keep set size manageable
            if (State.processedMessages.size > 100) {
                const first = State.processedMessages.values().next().value;
                State.processedMessages.delete(first);
            }

            log(`[${chatId}] ${body.slice(0, 50)}`);

            // Save to database
            await saveMessage(chatId, { body, fromMe: false, time: Date.now() });
            DB.stats.totalMessages++;

            // Track user
            if (!DB.users[chatId]) {
                DB.users[chatId] = { firstSeen: Date.now(), messages: 0 };
            }
            DB.users[chatId].messages++;
            DB.users[chatId].lastSeen = Date.now();

            // Skip if not ready
            if (!State.isReady) return;

            try {
                const chat = await msg.getChat();

                // Show typing indicator
                if (BOT_CONFIG.showTyping) {
                    await chat.sendStateTyping();
                }

                // Get AI response
                const reply = await getAIResponse(body, chatId);

                // Wait for response delay
                await new Promise(r => setTimeout(r, BOT_CONFIG.responseDelay));

                // Send reply
                const sent = await msg.reply(reply);

                // Clear typing indicator
                try {
                    await chat.clearState();
                } catch (e) {}

                // Save bot response
                if (sent) {
                    await saveMessage(chatId, { body: reply, fromMe: true, time: Date.now() });
                }

                // Check for payment screenshot
                if (msg.hasMedia) {
                    const lowerBody = body.toLowerCase();
                    if (lowerBody.includes('payment') || lowerBody.includes('screenshot') || lowerBody.includes('pay') || lowerBody.includes('done')) {
                        DB.stats.totalOrders++;
                        addOrder({
                            chatId: chatId,
                            type: 'payment_screenshot',
                            message: body,
                            hasMedia: true
                        });

                        // Notify admin
                        if (CONFIG.ADMIN_NUMBER) {
                            try {
                                const adminChat = `${CONFIG.ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                                await client.sendMessage(adminChat, `💰 Payment Screenshot Received!\n\nFrom: ${chatId}\nTime: ${new Date().toLocaleString()}\n\nCheck and process ASAP! 🔥`);
                            } catch (e) {}
                        }

                        // Auto-reply to customer
                        await new Promise(r => setTimeout(r, 1000));
                        await client.sendMessage(chatId, `Payment screenshot receive ho gaya bhai! ✅\n\nAdmin check kar ke eSIM bana dega, 5-10 minutes mein! ⏱️`);
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
    res.json({
        ok: true,
        status: State.status,
        ready: State.isReady,
        uptime: Date.now() - State.startTime
    });
});

// Status API
app.get('/api/status', (req, res) => {
    res.json({
        status: State.status,
        ready: State.isReady,
        qr: State.qrData,
        stats: DB.stats,
        users: Object.keys(DB.users).length,
        orders: DB.orders.length,
        logs: State.logs.slice(0, 15),
        uptime: Date.now() - State.startTime
    });
});

// Get orders API
app.get('/api/orders', (req, res) => {
    res.json({
        orders: DB.orders.slice(-20),
        total: DB.orders.length
    });
});

// Send message via API
app.post('/api/send', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ error: 'Missing number or message' });
    }
    if (!State.isReady) {
        return res.status(503).json({ error: 'Bot not ready' });
    }
    try {
        const chatId = `${number.replace(/\D/g, '')}@c.us`;
        const sent = await client.sendMessage(chatId, message);
        res.json({ success: true, messageId: sent?.id?.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Main dashboard page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${BUSINESS.name} Bot v7.0</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; min-height: 100vh; padding: 20px; }
        .container { max-width: 700px; margin: 0 auto; }
        .header { text-align: center; padding: 30px 0; }
        .logo { font-size: 3rem; }
        .title { font-size: 2rem; font-weight: bold; background: linear-gradient(45deg, #ff6b6b, #feca57); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { color: #888; margin-top: 5px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 16px 0; }
        .status-box { text-align: center; }
        .status-icon { font-size: 3rem; margin-bottom: 10px; }
        .status-title { font-size: 1.3rem; font-weight: 600; }
        .status-text { color: #888; font-size: 0.9rem; margin-top: 5px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; margin: 5px; }
        .badge-green { background: #2ecc71; color: #000; }
        .badge-red { background: #e74c3c; }
        .badge-yellow { background: #f39c12; color: #000; }
        .badge-blue { background: #3498db; }
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
        .log-error { color: #e74c3c !important; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .stat-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: bold; color: #feca57; }
        .stat-label { font-size: 0.8rem; color: #888; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.8rem; }
        .action-btn { background: linear-gradient(45deg, #ff6b6b, #feca57); border: none; padding: 12px 24px; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; margin: 5px; }
        .action-btn:hover { opacity: 0.9; }
        input[type="text"], input[type="number"] { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px; border-radius: 6px; color: #fff; margin: 5px; width: 200px; }
        .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 15px 0; }
        .plan-box { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; text-align: center; border: 2px solid transparent; }
        .plan-box.popular { border-color: #feca57; }
        .plan-icon { font-size: 2rem; }
        .plan-name { font-weight: bold; margin: 5px 0; }
        .plan-price { color: #feca57; font-size: 1.2rem; }
        .plan-detail { color: #888; font-size: 0.75rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚀</div>
            <div class="title">${BUSINESS.name}</div>
            <div class="subtitle">${BUSINESS.tagline}</div>
            <div style="margin-top: 10px;">
                <span class="badge badge-blue">v7.0 Config Edition</span>
                <span class="badge badge-green">Local DB</span>
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
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">📊 Live Statistics</div>
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
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">💎 eSIM Plans</div>
            <div class="plans">
                <div class="plan-box">
                    <div class="plan-icon">⚡</div>
                    <div class="plan-name">500MB</div>
                    <div class="plan-price">Rs. 130</div>
                    <div class="plan-detail">2 Years Validity</div>
                </div>
                <div class="plan-box popular">
                    <div class="plan-icon">🔥</div>
                    <div class="plan-name">1GB</div>
                    <div class="plan-price">Rs. 400</div>
                    <div class="plan-detail">Most Popular</div>
                </div>
                <div class="plan-box">
                    <div class="plan-icon">💎</div>
                    <div class="plan-name">5GB</div>
                    <div class="plan-price">Rs. 1500</div>
                    <div class="plan-detail">4 Devices</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">📋 Real-time Logs</div>
            <div class="logs" id="logsBox">
                <div class="log-item"><span class="log-time">--:--</span> Waiting...</div>
            </div>
        </div>

        <div class="card">
            <div style="color: #888; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 15px;">🛠️ Admin Actions</div>
            <div style="text-align: center;">
                <input type="text" id="sendNumber" placeholder="Phone Number (92300...)" />
                <input type="text" id="sendMessage" placeholder="Message..." />
                <br>
                <button class="action-btn" onclick="sendMessage()">Send Message</button>
                <button class="action-btn" onclick="location.reload()">Refresh Page</button>
            </div>
            <div id="sendResult" style="text-align: center; margin-top: 10px; font-size: 0.85rem;"></div>
        </div>

        <div class="footer">v7.0 Config.js Edition | No .env needed | Local JSON Database</div>
    </div>

    <script>
        const els = {
            statusIcon: document.getElementById('statusIcon'),
            statusTitle: document.getElementById('statusTitle'),
            statusText: document.getElementById('statusText'),
            loader: document.getElementById('loader'),
            qrCard: document.getElementById('qrCard'),
            successCard: document.getElementById('successCard'),
            logsBox: document.getElementById('logsBox')
        };

        let currentQR = null;

        function formatTime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
            if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
            return seconds + 's';
        }

        function updateUI(data) {
            document.getElementById('msgCount').textContent = data.stats?.totalMessages || 0;
            document.getElementById('orderCount').textContent = data.stats?.totalOrders || 0;
            document.getElementById('userCount').textContent = data.users || 0;

            if (data.logs?.length > 0) {
                els.logsBox.innerHTML = data.logs.map(l =>
                    '<div class="log-item ' + (l.type === 'error' ? 'log-error' : '') + '"><span class="log-time">' + l.time + '</span> ' + l.msg + '</div>'
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
                    els.statusText.textContent = 'Open WhatsApp on phone → Settings → Linked Devices';
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
                    els.statusText.textContent = 'Bot is ready for messages | Uptime: ' + formatTime(data.uptime || 0);
                    els.loader.style.display = 'none';
                    els.qrCard.classList.remove('show');
                    els.successCard.classList.add('show');
                    break;
                case 'DISCONNECTED':
                    els.statusIcon.textContent = '❌';
                    els.statusTitle.textContent = 'Disconnected';
                    els.statusText.textContent = 'Reconnecting...';
                    break;
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status?t=' + Date.now());
                updateUI(await res.json());
            } catch (e) { console.error(e); }
        }

        async function sendMessage() {
            const number = document.getElementById('sendNumber').value;
            const message = document.getElementById('sendMessage').value;
            const resultEl = document.getElementById('sendResult');

            if (!number || !message) {
                resultEl.innerHTML = '<span style="color: #e74c3c;">Enter number and message!</span>';
                return;
            }

            resultEl.innerHTML = '<span style="color: #888;">Sending...</span>';

            try {
                const res = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number, message })
                });
                const data = await res.json();
                if (data.success) {
                    resultEl.innerHTML = '<span style="color: #2ecc71;">✓ Message sent!</span>';
                    document.getElementById('sendMessage').value = '';
                } else {
                    resultEl.innerHTML = '<span style="color: #e74c3c;">✗ ' + (data.error || 'Failed') + '</span>';
                }
            } catch (e) {
                resultEl.innerHTML = '<span style="color: #e74c3c;">✗ Error: ' + e.message + '</span>';
            }
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
    log('SimFly OS v7.0 - Config.js Edition');
    log('Port: ' + CONFIG.PORT);
    log('Admin: ' + (CONFIG.ADMIN_NUMBER || 'Not set'));
    log('Database: Local JSON (' + DB_CONFIG.dbFile + ')');
    log('='.repeat(50));
    setTimeout(startWhatsApp, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Shutting down...');
    server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
    log('Shutting down...');
    server.close(() => process.exit(0));
});
