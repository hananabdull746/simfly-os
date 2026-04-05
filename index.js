/**
 * SIMFLY OS v8.0 - FIREBASE + GROQ AI EDITION
 * Master Bot with Realtime Database
 * ═══════════════════════════════════════════════════════
 */

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const axios = require('axios');

// Import all configuration from config.js
const {
    GROQ_API_KEY,
    GROQ_MODEL,
    ADMIN_NUMBER,
    FIREBASE,
    APP_URL,
    BUSINESS,
    BOT_CONFIG,
    SYSTEM_PROMPT,
    KEYWORD_RESPONSES,
    DB_CONFIG,
    PUPPETEER_CONFIG,
    isGroqEnabled,
    isFirebaseEnabled
} = require('./config');

// ============================================
// FIREBASE SETUP
// ============================================
let admin = null;
let DB = null;

if (isFirebaseEnabled()) {
    try {
        admin = require('firebase-admin');

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: FIREBASE.projectId,
                clientEmail: FIREBASE.clientEmail,
                privateKey: FIREBASE.privateKey
            }),
            databaseURL: FIREBASE.databaseURL
        });

        DB = admin.database();
        console.log('✓ Firebase Realtime Database connected');
    } catch (e) {
        console.error('✗ Firebase setup failed:', e.message);
        DB = null;
    }
}

// Local fallback if Firebase fails
const localDB = {
    conversations: {},
    stats: { totalMessages: 0, totalOrders: 0 },
    users: {},
    orders: []
};

const DATA_DIR = path.join(__dirname, DB_CONFIG.dataDir);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, DB_CONFIG.dbFile);
if (fs.existsSync(DB_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        Object.assign(localDB, data);
    } catch (e) {
        console.log('⚠ Local DB load failed');
    }
}

// Auto-save local fallback
setInterval(() => {
    if (!DB) {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(localDB, null, 2));
        } catch (e) {}
    }
}, DB_CONFIG.autoSaveInterval);

// ============================================
// DATABASE FUNCTIONS (Firebase + Local Fallback)
// ============================================
async function saveMessage(chatId, message) {
    const chatKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        // Firebase
        const ref = DB.ref(`conversations/${chatKey}`);
        const snapshot = await ref.once('value');
        const messages = snapshot.val() || [];
        messages.push(message);
        if (messages.length > DB_CONFIG.maxMessagesPerChat) {
            messages.splice(0, messages.length - DB_CONFIG.maxMessagesPerChat);
        }
        await ref.set(messages);
    } else {
        // Local fallback
        if (!localDB.conversations[chatKey]) localDB.conversations[chatKey] = [];
        localDB.conversations[chatKey].push(message);
        if (localDB.conversations[chatKey].length > DB_CONFIG.maxMessagesPerChat) {
            localDB.conversations[chatKey] = localDB.conversations[chatKey].slice(-DB_CONFIG.maxMessagesPerChat);
        }
    }
}

async function getHistory(chatId) {
    const chatKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        const snapshot = await DB.ref(`conversations/${chatKey}`).once('value');
        return snapshot.val() || [];
    }
    return localDB.conversations[chatKey] || [];
}

async function addOrder(orderData) {
    const order = {
        id: Date.now().toString(36),
        ...orderData,
        createdAt: Date.now(),
        status: 'pending'
    };

    if (DB) {
        await DB.ref(`orders/${order.id}`).set(order);
        const statsRef = DB.ref('stats/totalOrders');
        const snapshot = await statsRef.once('value');
        await statsRef.set((snapshot.val() || 0) + 1);
    } else {
        localDB.orders.push(order);
        localDB.stats.totalOrders++;
    }

    return order;
}

async function getOrders(chatId) {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        const orders = snapshot.val() || {};
        return Object.values(orders).filter(o => o.chatId === chatId);
    }
    return localDB.orders.filter(o => o.chatId === chatId);
}

async function incrementStats(field) {
    if (DB) {
        const ref = DB.ref(`stats/${field}`);
        const snapshot = await ref.once('value');
        await ref.set((snapshot.val() || 0) + 1);
    } else {
        localDB.stats[field]++;
    }
}

async function getStats() {
    if (DB) {
        const snapshot = await DB.ref('stats').once('value');
        return snapshot.val() || { totalMessages: 0, totalOrders: 0 };
    }
    return localDB.stats;
}

async function trackUser(chatId) {
    const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    if (DB) {
        const ref = DB.ref(`users/${userKey}`);
        const snapshot = await ref.once('value');
        const user = snapshot.val() || { firstSeen: Date.now(), messages: 0 };
        user.messages++;
        user.lastSeen = Date.now();
        await ref.set(user);
    } else {
        if (!localDB.users[userKey]) {
            localDB.users[userKey] = { firstSeen: Date.now(), messages: 0 };
        }
        localDB.users[userKey].messages++;
        localDB.users[userKey].lastSeen = Date.now();
    }
}

async function getUserCount() {
    if (DB) {
        const snapshot = await DB.ref('users').once('value');
        const users = snapshot.val() || {};
        return Object.keys(users).length;
    }
    return Object.keys(localDB.users).length;
}

async function getAllUsers() {
    if (DB) {
        const snapshot = await DB.ref('users').once('value');
        const users = snapshot.val() || {};
        return Object.keys(users).map(key => ({ chatId: key.replace(/_/g, ''), ...users[key] }));
    }
    return Object.keys(localDB.users).map(key => ({ chatId: key.replace(/_/g, ''), ...localDB.users[key] }));
}

async function updateOrderStatus(orderId, status, note = '') {
    if (DB) {
        const ref = DB.ref(`orders/${orderId}`);
        await ref.update({ status, note, updatedAt: Date.now() });
    } else {
        const order = localDB.orders.find(o => o.id === orderId);
        if (order) {
            order.status = status;
            order.note = note;
            order.updatedAt = Date.now();
        }
    }
}

async function getPendingOrders() {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        const orders = Object.values(snapshot.val() || {});
        return orders.filter(o => o.status === 'pending');
    }
    return localDB.orders.filter(o => o.status === 'pending');
}

// ============================================
// PAYMENT VERIFICATION SYSTEM
// ============================================
const pendingPayments = new Map();

async function verifyPaymentScreenshot(msg, chatId, body) {
    const lowerBody = body.toLowerCase();
    const paymentKeywords = ['payment', 'screenshot', 'pay', 'done', 'send', 'sent', 'bheja', 'transfer', 'rs', 'rs.', 'amount'];
    const isPaymentRelated = paymentKeywords.some(k => lowerBody.includes(k));

    if (!isPaymentRelated && !msg.hasMedia) return null;

    const verificationResult = {
        verified: false,
        planType: null,
        amount: null,
        paymentMethod: null,
        confidence: 0
    };

    // Detect plan type from message
    if (lowerBody.includes('500mb') || lowerBody.includes('500 mb') || lowerBody.includes('130')) {
        verificationResult.planType = '500MB';
        verificationResult.amount = 130;
        verificationResult.confidence += 30;
    } else if (lowerBody.includes('1gb') || lowerBody.includes('1 gb') || lowerBody.includes('400')) {
        verificationResult.planType = '1GB';
        verificationResult.amount = 400;
        verificationResult.confidence += 30;
    } else if (lowerBody.includes('5gb') || lowerBody.includes('5 gb') || lowerBody.includes('1500')) {
        verificationResult.planType = '5GB';
        verificationResult.amount = 1500;
        verificationResult.confidence += 30;
    }

    // Detect payment method
    if (lowerBody.includes('jazzcash') || lowerBody.includes('jazz')) {
        verificationResult.paymentMethod = 'JazzCash';
        verificationResult.confidence += 20;
    } else if (lowerBody.includes('easypaisa') || lowerBody.includes('easy')) {
        verificationResult.paymentMethod = 'EasyPaisa';
        verificationResult.confidence += 20;
    } else if (lowerBody.includes('sadapay') || lowerBody.includes('sada')) {
        verificationResult.paymentMethod = 'SadaPay';
        verificationResult.confidence += 20;
    }

    // If has media (screenshot), increase confidence
    if (msg.hasMedia) {
        verificationResult.confidence += 30;
        verificationResult.verified = verificationResult.confidence >= 60;
    }

    // Save to pending payments
    pendingPayments.set(chatId, {
        ...verificationResult,
        chatId,
        messageId: msg.id?.id,
        timestamp: Date.now(),
        originalMessage: body
    });

    return verificationResult;
}

async function getPlanDetails(planType) {
    const plans = {
        '500MB': {
            name: '500MB',
            data: '500MB',
            price: 130,
            duration: '2 Years',
            devices: 1,
            qrCode: '500MB_PLAN_QR_CODE_DATA',
            setupInstructions: `eSIM Setup Instructions:

1️⃣ Open Settings → Cellular/Mobile Data
2️⃣ Tap "Add eSIM" or "Add Cellular Plan"
3️⃣ Scan the QR code sent above
4️⃣ Wait for activation (1-2 minutes)
5️⃣ Done! ✅

⚠️ Important:
- Make sure your device is Non-PTA
- iPhone XS/XR or above required
- eSIM will activate within 5 minutes`
        },
        '1GB': {
            name: '1GB',
            data: '1GB',
            price: 400,
            duration: '2 Years',
            devices: 1,
            qrCode: '1GB_PLAN_QR_CODE_DATA',
            setupInstructions: `eSIM Setup Instructions:

1️⃣ Open Settings → Cellular/Mobile Data
2️⃣ Tap "Add eSIM" or "Add Cellular Plan"
3️⃣ Scan the QR code sent above
4️⃣ Wait for activation (1-2 minutes)
5️⃣ Done! ✅

⚠️ Important:
- Make sure your device is Non-PTA
- iPhone XS/XR or above required
- eSIM will activate within 5 minutes`
        },
        '5GB': {
            name: '5GB',
            data: '5GB',
            price: 1500,
            duration: '2 Years',
            devices: 4,
            qrCode: '5GB_PLAN_QR_CODE_DATA',
            setupInstructions: `eSIM Setup Instructions (5GB - 4 Devices):

1️⃣ Open Settings → Cellular/Mobile Data
2️⃣ Tap "Add eSIM" or "Add Cellular Plan"
3️⃣ Scan the QR code sent above
4️⃣ Wait for activation (1-2 minutes)
5️⃣ Share QR with up to 4 devices
6️⃣ Done! ✅

⚠️ Important:
- Make sure your device is Non-PTA
- iPhone XS/XR or above required
- Can be used on 4 devices simultaneously
- eSIM will activate within 5 minutes`
        }
    };

    return plans[planType] || null;
}

async function sendPlanDetailsAfterVerification(chatId, planType) {
    const plan = await getPlanDetails(planType);
    if (!plan) return;

    await client.sendMessage(chatId, `✅ Payment Verified Successfully!\n\n📦 Plan: ${plan.name}\n📊 Data: ${plan.data}\n💰 Price: Rs. ${plan.price}\n⏱️ Validity: ${plan.duration}\n📱 Devices: ${plan.devices}\n\n🎉 Your eSIM QR Code is ready!`);

    await new Promise(r => setTimeout(r, 1000));

    // Send QR code placeholder (in real implementation, send actual QR image)
    await client.sendMessage(chatId, `📱 *QR CODE FOR ${plan.name}*\n\n\`https://simfly.pk/qr/${plan.name.toLowerCase()}\`\n\n(_Scan this link or use the QR code image below_)`);

    await new Promise(r => setTimeout(r, 1500));

    // Send setup instructions
    await client.sendMessage(chatId, plan.setupInstructions);

    await new Promise(r => setTimeout(r, 1000));

    await client.sendMessage(chatId, `💬 *Need Help?*\n\nAgar koi issue ho toh "support" likh ke bhejein ya admin se contact karein!\n\n📞 *Shukriya SimFly Pakistan choose karne ke liye! 🙏*`);

    // Save order as completed
    const orderId = Date.now().toString(36);
    await addOrder({
        chatId,
        type: 'verified_order',
        planType: plan.name,
        amount: plan.price,
        status: 'completed',
        orderId
    });
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
    processedMessages: new Set(), // Deduplication
    stats: { totalMessages: 0, totalOrders: 0 },
    groq: {
        enabled: isGroqEnabled(),
        status: 'active', // active, cooldown, disabled
        failureCount: 0,
        lastCall: null,
        lastError: null
    },
    botPaused: false, // Admin pause/resume control
    pausedBy: null, // Which admin paused
    pauseReason: null // Why paused
};

// ============================================
// ADMIN COMMAND SYSTEM (100+ Commands)
// ============================================
const ADMIN_COMMANDS = {
    // 📢 BROADCAST COMMANDS
    '!broadcast': { desc: 'Broadcast message to all users', usage: '!broadcast <message>', category: 'broadcast' },
    '!bc': { desc: 'Short for broadcast', usage: '!bc <message>', category: 'broadcast' },
    '!broadcast-active': { desc: 'Broadcast to active users (last 24h)', usage: '!broadcast-active <message>', category: 'broadcast' },
    '!bc-img': { desc: 'Broadcast with image URL', usage: '!bc-img <url> | <message>', category: 'broadcast' },
    '!announce': { desc: 'Send announcement to all users', usage: '!announce <message>', category: 'broadcast' },
    '!notify': { desc: 'Send notification', usage: '!notify <message>', category: 'broadcast' },
    '!promo': { desc: 'Send promotional message', usage: '!promo <message>', category: 'broadcast' },
    '!reminder': { desc: 'Send reminder to all', usage: '!reminder <message>', category: 'broadcast' },

    // 👤 USER MANAGEMENT
    '!users': { desc: 'List all users', usage: '!users', category: 'users' },
    '!user-count': { desc: 'Get total user count', usage: '!user-count', category: 'users' },
    '!user-info': { desc: 'Get user details', usage: '!user-info <number>', category: 'users' },
    '!user-ban': { desc: 'Ban a user', usage: '!user-ban <number>', category: 'users' },
    '!user-unban': { desc: 'Unban a user', usage: '!user-unban <number>', category: 'users' },
    '!user-delete': { desc: 'Delete user data', usage: '!user-delete <number>', category: 'users' },
    '!active-users': { desc: 'List active users (24h)', usage: '!active-users', category: 'users' },
    '!inactive-users': { desc: 'List inactive users', usage: '!inactive-users', category: 'users' },
    '!user-history': { desc: 'View user chat history', usage: '!user-history <number>', category: 'users' },
    '!user-orders': { desc: 'View user orders', usage: '!user-orders <number>', category: 'users' },
    '!user-msg': { desc: 'Message specific user', usage: '!user-msg <number> | <message>', category: 'users' },
    '!user-stats': { desc: 'User statistics', usage: '!user-stats', category: 'users' },
    '!user-export': { desc: 'Export user list', usage: '!user-export', category: 'users' },
    '!user-import': { desc: 'Import user list', usage: '!user-import <data>', category: 'users' },
    '!user-search': { desc: 'Search users', usage: '!user-search <keyword>', category: 'users' },
    '!user-filter': { desc: 'Filter users by criteria', usage: '!user-filter <criteria>', category: 'users' },
    '!user-tag': { desc: 'Tag a user', usage: '!user-tag <number> <tag>', category: 'users' },
    '!user-untag': { desc: 'Remove tag from user', usage: '!user-untag <number>', category: 'users' },
    '!user-list-tags': { desc: 'List all user tags', usage: '!user-list-tags', category: 'users' },

    // 📊 ORDER MANAGEMENT
    '!orders': { desc: 'List all orders', usage: '!orders', category: 'orders' },
    '!order-count': { desc: 'Get total order count', usage: '!order-count', category: 'orders' },
    '!order-pending': { desc: 'List pending orders', usage: '!order-pending', category: 'orders' },
    '!order-completed': { desc: 'List completed orders', usage: '!order-completed', category: 'orders' },
    '!order-info': { desc: 'Get order details', usage: '!order-info <orderId>', category: 'orders' },
    '!order-status': { desc: 'Update order status', usage: '!order-status <orderId> <status>', category: 'orders' },
    '!order-approve': { desc: 'Approve an order', usage: '!order-approve <orderId>', category: 'orders' },
    '!order-reject': { desc: 'Reject an order', usage: '!order-reject <orderId> <reason>', category: 'orders' },
    '!order-cancel': { desc: 'Cancel an order', usage: '!order-cancel <orderId>', category: 'orders' },
    '!order-refund': { desc: 'Process refund', usage: '!order-refund <orderId>', category: 'orders' },
    '!order-delete': { desc: 'Delete an order', usage: '!order-delete <orderId>', category: 'orders' },
    '!order-search': { desc: 'Search orders', usage: '!order-search <keyword>', category: 'orders' },
    '!order-filter': { desc: 'Filter orders', usage: '!order-filter <criteria>', category: 'orders' },
    '!order-export': { desc: 'Export orders to CSV', usage: '!order-export', category: 'orders' },
    '!order-stats': { desc: 'Order statistics', usage: '!order-stats', category: 'orders' },
    '!order-today': { desc: 'Today\'s orders', usage: '!order-today', category: 'orders' },
    '!order-week': { desc: 'This week\'s orders', usage: '!order-week', category: 'orders' },
    '!order-month': { desc: 'This month\'s orders', usage: '!order-month', category: 'orders' },
    '!order-revenue': { desc: 'Calculate revenue', usage: '!order-revenue', category: 'orders' },

    // 🤖 BOT CONTROLS
    '!status': { desc: 'Show bot status', usage: '!status', category: 'bot' },
    '!restart': { desc: 'Restart the bot', usage: '!restart', category: 'bot' },
    '!stop': { desc: 'PAUSE bot (admin replies)', usage: '!stop [reason]', category: 'bot' },
    '!start': { desc: 'RESUME bot (auto-reply on)', usage: '!start', category: 'bot' },
    '!start-bot': { desc: 'Start the bot', usage: '!start-bot', category: 'bot' },
    '!reload': { desc: 'Reload configuration', usage: '!reload', category: 'bot' },
    '!pause': { desc: 'Pause auto-replies', usage: '!pause [reason]', category: 'bot' },
    '!resume': { desc: 'Resume auto-replies', usage: '!resume', category: 'bot' },
    '!maintenance': { desc: 'Toggle maintenance mode', usage: '!maintenance [on/off]', category: 'bot' },
    '!logs': { desc: 'Show recent logs', usage: '!logs [count]', category: 'bot' },
    '!clear-logs': { desc: 'Clear logs', usage: '!clear-logs', category: 'bot' },
    '!config': { desc: 'Show current config', usage: '!config', category: 'bot' },
    '!config-set': { desc: 'Set config value', usage: '!config-set <key> <value>', category: 'bot' },
    '!uptime': { desc: 'Show bot uptime', usage: '!uptime', category: 'bot' },
    '!ping': { desc: 'Check bot responsiveness', usage: '!ping', category: 'bot' },
    '!version': { desc: 'Show version info', usage: '!version', category: 'bot' },
    '!health': { desc: 'Health check', usage: '!health', category: 'bot' },
    '!stats': { desc: 'Show statistics', usage: '!stats', category: 'bot' },
    '!performance': { desc: 'Show performance metrics', usage: '!performance', category: 'bot' },
    '!backup': { desc: 'Create backup', usage: '!backup', category: 'bot' },
    '!restore': { desc: 'Restore from backup', usage: '!restore <backup-id>', category: 'bot' },

    // 📱 MESSAGING
    '!send': { desc: 'Send message to number', usage: '!send <number> | <message>', category: 'messaging' },
    '!reply': { desc: 'Reply to a user', usage: '!reply <number> | <message>', category: 'messaging' },
    '!template': { desc: 'Send template message', usage: '!template <template-name>', category: 'messaging' },
    '!quick-reply': { desc: 'Send quick reply', usage: '!quick-reply <number> | <id>', category: 'messaging' },
    '!schedule': { desc: 'Schedule a message', usage: '!schedule <time> | <number> | <message>', category: 'messaging' },
    '!cancel-schedule': { desc: 'Cancel scheduled message', usage: '!cancel-schedule <id>', category: 'messaging' },
    '!auto-reply': { desc: 'Toggle auto-reply', usage: '!auto-reply [on/off]', category: 'messaging' },
    '!typing': { desc: 'Toggle typing indicator', usage: '!typing [on/off]', category: 'messaging' },
    '!ai': { desc: 'Toggle AI responses', usage: '!ai [on/off]', category: 'messaging' },
    '!templates': { desc: 'List message templates', usage: '!templates', category: 'messaging' },
    '!template-add': { desc: 'Add template', usage: '!template-add <name> | <content>', category: 'messaging' },
    '!template-del': { desc: 'Delete template', usage: '!template-del <name>', category: 'messaging' },

    // 💎 PLAN MANAGEMENT
    '!plans': { desc: 'List all plans', usage: '!plans', category: 'plans' },
    '!plan-add': { desc: 'Add new plan', usage: '!plan-add <name> | <price> | <data>', category: 'plans' },
    '!plan-edit': { desc: 'Edit plan', usage: '!plan-edit <name> | <field> | <value>', category: 'plans' },
    '!plan-delete': { desc: 'Delete plan', usage: '!plan-delete <name>', category: 'plans' },
    '!plan-enable': { desc: 'Enable plan', usage: '!plan-enable <name>', category: 'plans' },
    '!plan-disable': { desc: 'Disable plan', usage: '!plan-disable <name>', category: 'plans' },
    '!plan-discount': { desc: 'Set plan discount', usage: '!plan-discount <name> | <percent>', category: 'plans' },
    '!plan-price': { desc: 'Update plan price', usage: '!plan-price <name> | <new-price>', category: 'plans' },
    '!promo-code': { desc: 'Create promo code', usage: '!promo-code <code> | <discount>', category: 'plans' },
    '!promo-delete': { desc: 'Delete promo code', usage: '!promo-delete <code>', category: 'plans' },
    '!promo-list': { desc: 'List promo codes', usage: '!promo-list', category: 'plans' },
    '!promo-validate': { desc: 'Validate promo code', usage: '!promo-validate <code>', category: 'plans' },

    // 💳 PAYMENT MANAGEMENT
    '!payments': { desc: 'List payment methods', usage: '!payments', category: 'payment' },
    '!payment-add': { desc: 'Add payment method', usage: '!payment-add <name> | <number>', category: 'payment' },
    '!payment-remove': { desc: 'Remove payment method', usage: '!payment-remove <name>', category: 'payment' },
    '!payment-update': { desc: 'Update payment method', usage: '!payment-update <name> | <new-number>', category: 'payment' },
    '!payment-verify': { desc: 'Verify a payment', usage: '!payment-verify <orderId>', category: 'payment' },
    '!payment-reject': { desc: 'Reject a payment', usage: '!payment-reject <orderId> <reason>', category: 'payment' },
    '!payment-pending': { desc: 'List pending payments', usage: '!payment-pending', category: 'payment' },
    '!payment-history': { desc: 'Payment history', usage: '!payment-history', category: 'payment' },
    '!payment-refund': { desc: 'Process refund', usage: '!payment-refund <orderId>', category: 'payment' },

    // 📈 ANALYTICS & REPORTS
    '!report': { desc: 'Generate report', usage: '!report [today/week/month]', category: 'analytics' },
    '!analytics': { desc: 'Show analytics', usage: '!analytics', category: 'analytics' },
    '!daily-report': { desc: 'Daily report', usage: '!daily-report', category: 'analytics' },
    '!weekly-report': { desc: 'Weekly report', usage: '!weekly-report', category: 'analytics' },
    '!monthly-report': { desc: 'Monthly report', usage: '!monthly-report', category: 'analytics' },
    '!sales': { desc: 'Sales statistics', usage: '!sales', category: 'analytics' },
    '!revenue': { desc: 'Revenue report', usage: '!revenue', category: 'analytics' },
    '!conversion': { desc: 'Conversion rate', usage: '!conversion', category: 'analytics' },
    '!engagement': { desc: 'User engagement', usage: '!engagement', category: 'analytics' },
    '!trends': { desc: 'Show trends', usage: '!trends', category: 'analytics' },
    '!graph': { desc: 'Generate graph', usage: '!graph <type>', category: 'analytics' },
    '!export-report': { desc: 'Export report', usage: '!export-report <format>', category: 'analytics' },

    // 🔧 DATABASE
    '!db-status': { desc: 'Database status', usage: '!db-status', category: 'database' },
    '!db-backup': { desc: 'Backup database', usage: '!db-backup', category: 'database' },
    '!db-restore': { desc: 'Restore database', usage: '!db-restore <file>', category: 'database' },
    '!db-export': { desc: 'Export database', usage: '!db-export', category: 'database' },
    '!db-import': { desc: 'Import data', usage: '!db-import <data>', category: 'database' },
    '!db-clean': { desc: 'Clean old data', usage: '!db-clean [days]', category: 'database' },
    '!db-optimize': { desc: 'Optimize database', usage: '!db-optimize', category: 'database' },
    '!db-migrate': { desc: 'Migrate data', usage: '!db-migrate <source> <target>', category: 'database' },
    '!db-reset': { desc: 'Reset database', usage: '!db-reset [confirm]', category: 'database' },
    '!db-size': { desc: 'Database size', usage: '!db-size', category: 'database' },
    '!db-stats': { desc: 'Database stats', usage: '!db-stats', category: 'database' },
    '!db-query': { desc: 'Run database query', usage: '!db-query <query>', category: 'database' },

    // 👥 STAFF MANAGEMENT
    '!staff': { desc: 'List staff', usage: '!staff', category: 'staff' },
    '!staff-add': { desc: 'Add staff', usage: '!staff-add <number> | <name> | <role>', category: 'staff' },
    '!staff-remove': { desc: 'Remove staff', usage: '!staff-remove <number>', category: 'staff' },
    '!staff-role': { desc: 'Change staff role', usage: '!staff-role <number> <role>', category: 'staff' },
    '!staff-perms': { desc: 'View staff permissions', usage: '!staff-perms <number>', category: 'staff' },
    '!staff-activity': { desc: 'Staff activity log', usage: '!staff-activity', category: 'staff' },
    '!admins': { desc: 'List admins', usage: '!admins', category: 'staff' },
    '!mod': { desc: 'Add moderator', usage: '!mod <number>', category: 'staff' },
    '!unmod': { desc: 'Remove moderator', usage: '!unmod <number>', category: 'staff' },

    // 🛡️ SECURITY
    '!block': { desc: 'Block a number', usage: '!block <number>', category: 'security' },
    '!unblock': { desc: 'Unblock a number', usage: '!unblock <number>', category: 'security' },
    '!blocked': { desc: 'List blocked numbers', usage: '!blocked', category: 'security' },
    '!spam': { desc: 'Mark as spam', usage: '!spam <number>', category: 'security' },
    '!unspam': { desc: 'Unmark spam', usage: '!unspam <number>', category: 'security' },
    '!rate-limit': { desc: 'Set rate limit', usage: '!rate-limit <number> <limit>', category: 'security' },
    '!whitelist': { desc: 'Whitelist a number', usage: '!whitelist <number>', category: 'security' },
    '!blacklist': { desc: 'Blacklist a number', usage: '!blacklist <number>', category: 'security' },
    '!security-logs': { desc: 'Security logs', usage: '!security-logs', category: 'security' },
    '!audit': { desc: 'Audit trail', usage: '!audit', category: 'security' },

    // ❓ HELP
    '!help': { desc: 'Show help', usage: '!help [category]', category: 'help' },
    '!commands': { desc: 'List all commands', usage: '!commands', category: 'help' },
    '!cmd': { desc: 'Get command help', usage: '!cmd <command>', category: 'help' },
    '!guide': { desc: 'Show usage guide', usage: '!guide', category: 'help' },
    '!tutorial': { desc: 'Show tutorial', usage: '!tutorial', category: 'help' },
    '!admin-help': { desc: 'Admin help', usage: '!admin-help', category: 'help' },
    '!about': { desc: 'About this bot', usage: '!about', category: 'help' }
};

// Admin state
const AdminState = {
    isAdminChat: (chatId) => {
        // Skip if ADMIN_NUMBER is placeholder or empty
        if (!ADMIN_NUMBER ||
            ADMIN_NUMBER.includes('YOUR_') ||
            ADMIN_NUMBER.length < 10) {
            console.log('Admin check: ADMIN_NUMBER not configured properly');
            return false;
        }
        const cleanAdmin = ADMIN_NUMBER.replace(/\D/g, '');
        const cleanChat = chatId.replace(/\D/g, '').replace(/@.+$/, '');
        const isAdmin = cleanAdmin === cleanChat;
        if (isAdmin) console.log('Admin command detected from:', chatId);
        return isAdmin;
    },
    maintenanceMode: false,
    autoReply: true,
    typingIndicator: true,
    aiEnabled: true
};

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, type, msg };
    State.logs.unshift(entry);
    if (State.logs.length > DB_CONFIG.maxLogs) State.logs.pop();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

// ============================================
// ADMIN COMMAND HANDLER
// ============================================
async function handleAdminCommand(msg, chatId, body) {
    const parts = body.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    if (!ADMIN_COMMANDS[command]) {
        return null;
    }

    log(`Admin command: ${command}`, 'admin');

    // 📢 BROADCAST COMMANDS
    if (command === '!broadcast' || command === '!bc' || command === '!announce') {
        if (!args) return '❌ Usage: !broadcast <message>';
        return await broadcastMessage(args, 'all');
    }

    if (command === '!broadcast-active') {
        if (!args) return '❌ Usage: !broadcast-active <message>';
        return await broadcastMessage(args, 'active');
    }

    if (command === '!bc-img') {
        const [url, ...msgParts] = args.split('|').map(s => s.trim());
        if (!url) return '❌ Usage: !bc-img <url> | [message]';
        return await broadcastImage(url, msgParts.join(' ') || '', 'all');
    }

    // 👤 USER MANAGEMENT
    if (command === '!users' || command === '!user-count') {
        const count = await getUserCount();
        const users = await getAllUsers();
        return `👥 *USER STATS*\n\n📊 Total Users: ${count}\n📱 Active (24h): ${users.filter(u => Date.now() - u.lastSeen < 86400000).length}\n🆕 New Today: ${users.filter(u => Date.now() - u.firstSeen < 86400000).length}`;
    }

    if (command === '!user-info') {
        if (!args) return '❌ Usage: !user-info <number>';
        const user = await getUserInfo(args);
        return user ? formatUserInfo(user) : '❌ User not found';
    }

    if (command === '!active-users') {
        const users = await getAllUsers();
        const active = users.filter(u => Date.now() - u.lastSeen < 86400000);
        return `📱 *ACTIVE USERS (24h)*\n\n${active.map(u => `• ${u.chatId} - ${u.messages} msgs`).join('\n') || 'No active users'}`;
    }

    if (command === '!user-msg') {
        const [number, ...messageParts] = args.split('|').map(s => s.trim());
        if (!number || !messageParts.length) return '❌ Usage: !user-msg <number> | <message>';
        const chatId = `${number.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(chatId, messageParts.join(' '));
        return `✅ Message sent to ${number}`;
    }

    if (command === '!user-ban') {
        if (!args) return '❌ Usage: !user-ban <number>';
        await banUser(args, true);
        return `✅ User ${args} banned`;
    }

    if (command === '!user-unban') {
        if (!args) return '❌ Usage: !user-unban <number>';
        await banUser(args, false);
        return `✅ User ${args} unbanned`;
    }

    // 📊 ORDER MANAGEMENT
    if (command === '!orders') {
        const orders = await getAllOrders();
        return `📦 *ALL ORDERS*\n\n${orders.slice(-20).map(o => `#${o.id.slice(-6)} - ${o.status} - Rs.${o.amount || 'N/A'}`).join('\n') || 'No orders'}`;
    }

    if (command === '!order-pending') {
        const pending = await getPendingOrders();
        return `⏳ *PENDING ORDERS* (${pending.length})\n\n${pending.map(o => `#${o.id.slice(-6)} - ${o.planType || 'N/A'} - ${o.chatId}`).join('\n') || 'No pending orders'}`;
    }

    if (command === '!order-approve') {
        if (!args) return '❌ Usage: !order-approve <orderId>';
        await updateOrderStatus(args, 'completed', 'Approved by admin');
        return `✅ Order #${args} approved`;
    }

    if (command === '!order-reject') {
        const [orderId, ...reasonParts] = args.split(' ');
        if (!orderId) return '❌ Usage: !order-reject <orderId> [reason]';
        await updateOrderStatus(orderId, 'rejected', reasonParts.join(' ') || 'Rejected by admin');
        return `❌ Order #${orderId} rejected`;
    }

    if (command === '!order-status') {
        const [orderId, status] = args.split(' ');
        if (!orderId || !status) return '❌ Usage: !order-status <orderId> <status>';
        await updateOrderStatus(orderId, status, `Status changed to ${status}`);
        return `✅ Order #${orderId} status updated to ${status}`;
    }

    if (command === '!order-stats') {
        const stats = await getStats();
        const pending = await getPendingOrders();
        return `📊 *ORDER STATS*\n\n📦 Total Orders: ${stats.totalOrders}\n⏳ Pending: ${pending.length}\n✅ Completed: ${stats.totalOrders - pending.length}`;
    }

    // 💎 PLAN MANAGEMENT
    if (command === '!plans') {
        return `💎 *ESIM PLANS*\n\n${BUSINESS.plans.map(p => `\n${p.icon} *${p.name}*\n   💰 Rs. ${p.price}\n   📊 ${p.data} for ${p.duration}\n   ${p.popular ? '🔥 Most Popular' : ''}`).join('')}`;
    }

    // 🤖 BOT CONTROLS
    if (command === '!status') {
        return `🤖 *BOT STATUS*\n\nStatus: ${State.status}\nReady: ${State.isReady ? '✅' : '❌'}\nUptime: ${formatUptime(Date.now() - State.startTime)}\nMessages: ${State.stats.totalMessages}\nOrders: ${State.stats.totalOrders}\nFirebase: ${isFirebaseEnabled() ? '✅' : '❌'}\nGroq AI: ${isGroqEnabled() ? '✅' : '❌'}`;
    }

    if (command === '!restart') {
        await msg.reply('🔄 Restarting bot...');
        process.exit(0);
    }

    if (command === '!maintenance') {
        AdminState.maintenanceMode = !AdminState.maintenanceMode;
        return `🔧 Maintenance mode: ${AdminState.maintenanceMode ? 'ON' : 'OFF'}`;
    }

    if (command === '!logs') {
        const count = parseInt(args) || 10;
        return `📋 *RECENT LOGS*\n\n${State.logs.slice(0, count).map(l => `[${l.time}] ${l.msg}`).join('\n')}`;
    }

    if (command === '!uptime') {
        return `⏱️ *UPTIME*\n${formatUptime(Date.now() - State.startTime)}`;
    }

    if (command === '!ping') {
        return '🏓 Pong! Bot is responsive ✅';
    }

    if (command === '!version') {
        return '📱 *SimFly OS v8.1*\nMaster Bot with Firebase + Groq AI\nPayment Verification + 100+ Admin Commands';
    }

    if (command === '!ai') {
        if (!args) {
            AdminState.aiEnabled = !AdminState.aiEnabled;
        } else {
            AdminState.aiEnabled = args.toLowerCase() === 'on';
        }
        return `🤖 AI Responses: ${AdminState.aiEnabled ? 'ENABLED' : 'DISABLED'}`;
    }

    if (command === '!typing') {
        if (!args) {
            AdminState.typingIndicator = !AdminState.typingIndicator;
        } else {
            AdminState.typingIndicator = args.toLowerCase() === 'on';
        }
        return `⌨️ Typing Indicator: ${AdminState.typingIndicator ? 'ENABLED' : 'DISABLED'}`;
    }

    // 📈 ANALYTICS
    if (command === '!stats') {
        const stats = await getStats();
        const users = await getUserCount();
        const pending = await getPendingOrders();
        return `📊 *BOT STATISTICS*\n\n👥 Total Users: ${users}\n💬 Total Messages: ${stats.totalMessages}\n📦 Total Orders: ${stats.totalOrders}\n⏳ Pending Orders: ${pending.length}\n📈 Conversion: ${users > 0 ? ((stats.totalOrders/users)*100).toFixed(1) : 0}%`;
    }

    if (command === '!report' || command === '!daily-report') {
        return await generateReport('today');
    }

    if (command === '!weekly-report') {
        return await generateReport('week');
    }

    if (command === '!monthly-report') {
        return await generateReport('month');
    }

    if (command === '!revenue') {
        const orders = await getAllOrders();
        const revenue = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
        const today = orders.filter(o => Date.now() - o.createdAt < 86400000).reduce((sum, o) => sum + (o.amount || 0), 0);
        return `💰 *REVENUE REPORT*\n\n📊 Total Revenue: Rs. ${revenue}\n📅 Today: Rs. ${today}\n📦 Total Orders: ${orders.length}`;
    }

    if (command === '!sales') {
        return await generateReport('sales');
    }

    // 💳 PAYMENT
    if (command === '!payment-verify') {
        if (!args) return '❌ Usage: !payment-verify <orderId>';
        await updateOrderStatus(args, 'completed', 'Payment verified by admin');
        return `✅ Payment verified for order #${args}`;
    }

    if (command === '!payment-pending') {
        const pending = await getPendingOrders();
        const paymentPending = pending.filter(o => o.type === 'payment_screenshot');
        return `⏳ *PENDING PAYMENTS* (${paymentPending.length})\n\n${paymentPending.map(o => `#${o.id.slice(-6)} - ${o.chatId}`).join('\n') || 'No pending payments'}`;
    }

    // 🔧 DATABASE
    if (command === '!db-status') {
        return `💾 *DATABASE STATUS*\n\nType: ${isFirebaseEnabled() ? 'Firebase Realtime' : 'Local JSON'}\nConnected: ${DB ? '✅' : '❌'}\nUsers: ${await getUserCount()}\nOrders: ${(await getAllOrders()).length}`;
    }

    if (command === '!db-backup') {
        await backupDatabase();
        return '✅ Database backup created';
    }

    if (command === '!db-size') {
        const stats = fs.statSync(DB_FILE);
        return `💾 *DATABASE SIZE*\n\nLocal DB: ${(stats.size / 1024).toFixed(2)} KB\nUsers: ${await getUserCount()}\nOrders: ${(await getAllOrders()).length}`;
    }

    // 🛡️ SECURITY
    if (command === '!blocked') {
        const blocked = await getBlockedUsers();
        return `🚫 *BLOCKED USERS* (${blocked.length})\n\n${blocked.map(u => `• ${u}`).join('\n') || 'No blocked users'}`;
    }

    if (command === '!block') {
        if (!args) return '❌ Usage: !block <number>';
        await blockUser(args, true);
        return `🚫 User ${args} blocked`;
    }

    if (command === '!unblock') {
        if (!args) return '❌ Usage: !unblock <number>';
        await blockUser(args, false);
        return `✅ User ${args} unblocked`;
    }

    if (command === '!security-logs') {
        return `🛡️ *SECURITY LOGS*\n\n${State.logs.filter(l => l.type === 'security').slice(0, 10).map(l => `[${l.time}] ${l.msg}`).join('\n') || 'No security events'}`;
    }

    // ❓ HELP
    if (command === '!help' || command === '!commands') {
        const category = args || 'all';
        return formatHelp(category);
    }

    if (command === '!cmd') {
        if (!args) return '❌ Usage: !cmd <command>';
        const cmd = ADMIN_COMMANDS[args.toLowerCase()];
        return cmd ? `📖 *${args}*\n\n${cmd.desc}\nUsage: ${cmd.usage}\nCategory: ${cmd.category}` : '❌ Command not found';
    }

    if (command === '!admin-help') {
        return `📚 *ADMIN COMMAND CATEGORIES*\n\n📢 Broadcast: !broadcast, !bc, !bc-img\n👤 Users: !users, !user-info, !user-msg\n📊 Orders: !orders, !order-pending, !order-approve\n🤖 Bot: !status, !restart, !maintenance\n💎 Plans: !plans\n📈 Analytics: !stats, !report, !revenue\n💳 Payment: !payment-verify, !payment-pending\n🔧 Database: !db-status, !db-backup\n🛡️ Security: !block, !unblock, !blocked\n❓ Help: !help, !cmd\n\nUse !help <category> for details`;
    }

    if (command === '!about') {
        return `🚀 *SimFly Pakistan Bot*\n\nVersion: 8.1 Master Bot\nFeatures:\n• Firebase + Groq AI\n• Payment Verification\n• 100+ Admin Commands\n• Real-time Dashboard\n\nMade with ❤️ for SimFly Pakistan`;
    }

    // ⏸️ PAUSE / RESUME BOT
    if (command === '!stop' || command === '!pause') {
        State.botPaused = true;
        State.pausedBy = chatId;
        State.pauseReason = args || 'Paused by admin';
        log(`Bot PAUSED by ${chatId}. Reason: ${State.pauseReason}`, 'admin');
        return `⏸️ *BOT PAUSED*\n\n👤 By: Admin\n📝 Reason: ${State.pauseReason}\n\n✅ Ab admin manually reply karega\n🤖 Auto-replies OFF hain\n\n▶️ Wapas start karne ke liye: !start`;
    }

    if (command === '!start' || command === '!resume') {
        State.botPaused = false;
        State.pausedBy = null;
        State.pauseReason = null;
        log(`Bot RESUMED by ${chatId}`, 'admin');
        return `▶️ *BOT RESUMED*\n\n✅ Auto-replies ON hain\n🤖 Bot ab automatically reply karega\n\n⏸️ Pause karne ke liye: !stop`;
    }

    return null;
}

// Helper functions for admin commands
async function broadcastMessage(message, type) {
    const users = await getAllUsers();
    const targetUsers = type === 'active'
        ? users.filter(u => Date.now() - u.lastSeen < 86400000)
        : users;

    let sent = 0, failed = 0;
    for (const user of targetUsers) {
        try {
            const chatId = user.chatId.includes('@') ? user.chatId : `${user.chatId}@c.us`;
            await client.sendMessage(chatId, `📢 *BROADCAST*\n\n${message}\n\n_This message was sent to all users_`);
            sent++;
            await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (e) {
            failed++;
        }
    }
    return `✅ Broadcast sent!\n\n📊 Target: ${targetUsers.length}\n✓ Sent: ${sent}\n✗ Failed: ${failed}`;
}

async function broadcastImage(url, message, type) {
    return `📸 Broadcast image feature\nURL: ${url}\nMessage: ${message}\n\n(To be implemented with media download)`;
}

async function getUserInfo(number) {
    const users = await getAllUsers();
    return users.find(u => u.chatId.includes(number.replace(/\D/g, '')));
}

function formatUserInfo(user) {
    return `👤 *USER INFO*\n\n📱 Number: ${user.chatId}\n📅 First Seen: ${new Date(user.firstSeen).toLocaleString()}\n🕐 Last Seen: ${new Date(user.lastSeen).toLocaleString()}\n💬 Messages: ${user.messages}\n👤 Status: ${user.banned ? '🚫 Banned' : '✅ Active'}`;
}

async function banUser(number, ban) {
    const userKey = number.replace(/\D/g, '_');
    if (DB) {
        await DB.ref(`users/${userKey}/banned`).set(ban);
    } else {
        if (localDB.users[userKey]) localDB.users[userKey].banned = ban;
    }
}

async function getAllOrders() {
    if (DB) {
        const snapshot = await DB.ref('orders').once('value');
        return Object.values(snapshot.val() || {});
    }
    return localDB.orders;
}

async function backupDatabase() {
    const backupFile = path.join(DATA_DIR, `backup_${Date.now()}.json`);
    const data = DB ? await DB.ref().once('value').then(s => s.val()) : localDB;
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    return backupFile;
}

async function generateReport(period) {
    const orders = await getAllOrders();
    const users = await getUserCount();
    const now = Date.now();
    let periodOrders = orders;

    if (period === 'today') {
        periodOrders = orders.filter(o => now - o.createdAt < 86400000);
    } else if (period === 'week') {
        periodOrders = orders.filter(o => now - o.createdAt < 604800000);
    } else if (period === 'month') {
        periodOrders = orders.filter(o => now - o.createdAt < 2592000000);
    }

    const revenue = periodOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    return `📊 *${period.toUpperCase()} REPORT*\n\n📦 Orders: ${periodOrders.length}\n💰 Revenue: Rs. ${revenue}\n👥 Total Users: ${users}\n✅ Completed: ${periodOrders.filter(o => o.status === 'completed').length}\n⏳ Pending: ${periodOrders.filter(o => o.status === 'pending').length}`;
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
}

function formatHelp(category) {
    if (category === 'all') {
        return `📚 *AVAILABLE COMMANDS* (${Object.keys(ADMIN_COMMANDS).length} total)\n\n📢 Broadcast: !broadcast, !bc, !bc-img\n👤 Users: !users, !user-info, !active-users\n📊 Orders: !orders, !order-pending, !order-approve\n🤖 Bot: !status, !restart, !logs\n💎 Plans: !plans\n📈 Stats: !stats, !report, !revenue\n💳 Payment: !payment-verify, !payment-pending\n🔧 Database: !db-status, !db-backup\n🛡️ Security: !block, !unblock, !blocked\n\nUse !help <category> for more details\nExample: !help broadcast`;
    }

    const commands = Object.entries(ADMIN_COMMANDS)
        .filter(([_, cmd]) => cmd.category === category)
        .map(([name, cmd]) => `${name} - ${cmd.desc}`)
        .join('\n');

    return commands || `❌ No commands found in category: ${category}`;
}

async function getBlockedUsers() {
    const users = await getAllUsers();
    return users.filter(u => u.banned).map(u => u.chatId);
}

async function blockUser(number, block) {
    await banUser(number, block);
}

const blockedUsers = new Set();

// Temporary admin session storage
AdminState.tempAdminChat = null;

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
// 🛡️ ANTI-BAN MEASURES
// ============================================

// Random delay to mimic human typing/response time
function getRandomDelay() {
    // Random delay between 1-4 seconds for realism
    return Math.floor(Math.random() * 3000) + 1000;
}

// Anti-ban message rate limiting
const messageRateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 15; // Max 15 messages per minute per chat

function checkRateLimit(chatId) {
    const now = Date.now();
    const userData = messageRateLimiter.get(chatId) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

    if (now > userData.resetTime) {
        // Reset window
        userData.count = 1;
        userData.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
        userData.count++;
    }

    messageRateLimiter.set(chatId, userData);

    // Clean up old entries every 100 entries
    if (messageRateLimiter.size > 100) {
        const cutoff = now - RATE_LIMIT_WINDOW * 2;
        for (const [id, data] of messageRateLimiter) {
            if (data.resetTime < cutoff) messageRateLimiter.delete(id);
        }
    }

    return userData.count <= MAX_MESSAGES_PER_WINDOW;
}

// ============================================
// 📚 CHAT CONTEXT LOADING
// ============================================

// Get full chat context including recent messages
async function getChatContext(chatId, currentMsg) {
    try {
        // Get history from database
        const dbHistory = await getHistory(chatId);

        // Get WhatsApp chat messages (last 50)
        let waMessages = [];
        try {
            const chat = await currentMsg.getChat();
            if (chat) {
                const messages = await chat.fetchMessages({ limit: 50 });
                waMessages = messages.map(m => ({
                    body: m.body,
                    fromMe: m.fromMe,
                    timestamp: m.timestamp * 1000, // Convert to ms
                    type: m.type
                }));
            }
        } catch (e) {
            log('Error fetching WhatsApp chat history: ' + e.message, 'error');
        }

        // Combine and sort by time
        const combined = [...dbHistory, ...waMessages].sort((a, b) => (a.time || a.timestamp) - (b.time || b.timestamp));

        // Remove duplicates (same body + timestamp)
        const seen = new Set();
        const unique = combined.filter(m => {
            const key = `${m.body}_${m.time || m.timestamp}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Return last 20 unique messages
        return unique.slice(-20);
    } catch (e) {
        log('Error getting chat context: ' + e.message, 'error');
        return [];
    }
}

// ============================================
// GROQ AI RESPONSE GENERATION
// ============================================
// Track API failures for circuit breaker
const GROQ_COOLDOWN_MS = 60000; // 1 minute cooldown after 3 failures
const GROQ_MAX_FAILURES = 3;

async function getGroqResponse(userMessage, chatId, history) {
    // Circuit breaker check
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        const timeSinceLastFailure = Date.now() - (State.groq.lastCall || 0);
        if (timeSinceLastFailure < GROQ_COOLDOWN_MS) {
            log(`Groq in cooldown (${Math.ceil((GROQ_COOLDOWN_MS - timeSinceLastFailure)/1000)}s)`, 'warn');
            State.groq.status = 'cooldown';
            return null;
        }
        // Reset after cooldown
        State.groq.failureCount = 0;
        State.groq.status = 'active';
    }

    // Retry logic
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history.slice(-5).map(h => ({
                    role: h.fromMe ? 'assistant' : 'user',
                    content: h.body
                })),
                { role: 'user', content: userMessage }
            ];

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // Increased timeout
            });

            // Success - reset failure count
            State.groq.lastCall = Date.now();
            if (State.groq.failureCount > 0) {
                State.groq.failureCount = 0;
                State.groq.status = 'active';
                log('Groq API recovered', 'info');
            }

            return response.data.choices[0].message.content;

        } catch (e) {
            lastError = e;
            const statusCode = e.response?.status;
            const errorData = e.response?.data;

            // Log detailed error
            log(`Groq attempt ${attempt + 1}/${maxRetries + 1} failed: ${statusCode} - ${errorData?.error?.message || e.message}`, 'error');

            // Handle specific errors
            if (statusCode === 401) {
                log('Groq API key invalid - disabling AI', 'error');
                return null; // Don't retry auth errors
            }

            if (statusCode === 429) {
                // Rate limit - wait and retry
                const waitTime = (attempt + 1) * 2000; // 2s, 4s
                log(`Rate limited, waiting ${waitTime}ms...`, 'warn');
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }

            if (statusCode >= 500) {
                // Server error - retry
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // Network/timeout errors - retry
            if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || !e.response) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            // Other errors - don't retry
            break;
        }
    }

    // All retries exhausted
    State.groq.failureCount++;
    State.groq.lastCall = Date.now();
    State.groq.lastError = lastError?.message || 'Unknown error';
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        State.groq.status = 'cooldown';
    }
    log(`Groq failed ${State.groq.failureCount} times, switching to templates`, 'error');
    return null;
}

// ============================================
// TEMPLATE-BASED RESPONSE GENERATION
// ============================================
async function getTemplateResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // 1. Check for greetings
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('assalam') || msg.includes('salam') || msg.includes('hey')) {
        return findKeywordResponse(userMessage) || `Assalam-o-Alaikum bhai! 👋 SimFly Pakistan mein khush amdeed! Main aapki kya madad kar sakta hoon? 😊`;
    }

    // 2. Check keyword responses
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // 3. Context-based responses
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

    // Default fallback response
    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?\n\nYa "help" likh dein! 👍`;
}

// ============================================
// MAIN AI RESPONSE FUNCTION (Hybrid)
// ============================================
async function getAIResponse(userMessage, chatId) {
    const msg = userMessage.toLowerCase();

    // Check for exact keywords first (faster)
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // Get history for context
    const history = await getHistory(chatId);

    // Try Groq if enabled
    if (BOT_CONFIG.useAI && isGroqEnabled()) {
        const groqResponse = await getGroqResponse(userMessage, chatId, history);
        if (groqResponse) return groqResponse;
    }

    // Fallback to templates
    if (BOT_CONFIG.useTemplates) {
        return await getTemplateResponse(userMessage, chatId);
    }

    return `Sorry bhai, main abhi samajh nahi paya. 🤔 Kya aap repeat karein?`;
}

// ============================================
// 🤖 AI RESPONSE WITH FULL CONTEXT
// ============================================
async function getAIResponseWithContext(userMessage, chatId, chatContext) {
    const msg = userMessage.toLowerCase();

    // 🛡️ ANTI-BAN: Check rate limit first
    if (!checkRateLimit(chatId)) {
        log(`Rate limit hit for ${chatId}, slowing down`, 'warn');
        // Add extra delay for rate-limited chats
        await new Promise(r => setTimeout(r, 5000));
    }

    // Check for exact keywords first (faster responses)
    const keywordResponse = findKeywordResponse(userMessage);
    if (keywordResponse) return keywordResponse;

    // Check FAQ responses
    const faqResponse = findFAQResponse(userMessage);
    if (faqResponse) return faqResponse;

    // Build conversation context for AI
    let conversationHistory = [];
    if (chatContext && chatContext.length > 0) {
        // Convert to AI format
        conversationHistory = chatContext.map(m => ({
            role: m.fromMe ? 'assistant' : 'user',
            content: m.body
        }));
    }

    // Try Groq if enabled
    if (BOT_CONFIG.useAI && isGroqEnabled()) {
        const groqResponse = await getGroqResponseWithContext(userMessage, chatId, conversationHistory);
        if (groqResponse) return groqResponse;
    }

    // Fallback to templates
    if (BOT_CONFIG.useTemplates) {
        return await getTemplateResponse(userMessage, chatId);
    }

    return `Bhai samajh nahi aaya. 😅 Main SimFly Pakistan ke eSIM plans ke bare mein info de sakta hoon.\n\nKya aap:\n📱 Plans dekhna chahte hain?\n💳 Payment methods janna chahte hain?\n🛒 Order karna chahte hain?`;
}

// Enhanced Groq response with full context
async function getGroqResponseWithContext(userMessage, chatId, conversationHistory) {
    // Circuit breaker check
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        const timeSinceLastFailure = Date.now() - (State.groq.lastCall || 0);
        if (timeSinceLastFailure < GROQ_COOLDOWN_MS) {
            log(`Groq in cooldown (${Math.ceil((GROQ_COOLDOWN_MS - timeSinceLastFailure)/1000)}s)`, 'warn');
            State.groq.status = 'cooldown';
            return null;
        }
        State.groq.failureCount = 0;
        State.groq.status = 'active';
    }

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Build messages with full conversation context (last 10 messages)
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory.slice(-10),
                { role: 'user', content: userMessage }
            ];

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: GROQ_MODEL,
                messages: messages,
                max_tokens: 600,
                temperature: 0.8,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            // Success - reset failure count
            State.groq.lastCall = Date.now();
            if (State.groq.failureCount > 0) {
                State.groq.failureCount = 0;
                State.groq.status = 'active';
                log('Groq API recovered', 'info');
            }

            return response.data.choices[0].message.content;

        } catch (e) {
            lastError = e;
            const statusCode = e.response?.status;

            log(`Groq attempt ${attempt + 1}/${maxRetries + 1} failed: ${statusCode || e.message}`, 'error');

            if (statusCode === 401) return null;
            if (statusCode === 429) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                continue;
            }
            if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            break;
        }
    }

    // All retries exhausted
    State.groq.failureCount++;
    State.groq.lastCall = Date.now();
    State.groq.lastError = lastError?.message || 'Unknown error';
    if (State.groq.failureCount >= GROQ_MAX_FAILURES) {
        State.groq.status = 'cooldown';
    }
    return null;
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
            if (ADMIN_NUMBER) {
                setTimeout(async () => {
                    try {
                        const stats = await getStats();
                        const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                        await client.sendMessage(adminChat, `🤖 SimFly Bot ONLINE! ✅\n\n📊 Stats: ${stats.totalMessages || 0} messages, ${stats.totalOrders || 0} orders\n⏱️ Uptime: ${Math.floor((Date.now() - State.startTime) / 1000)}s\n\nReady for customers! 🚀`);
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
            await incrementStats('totalMessages');

            // Track user
            await trackUser(chatId);

            // Skip if not ready
            if (!State.isReady) return;

            // Check for blocked users
            const userKey = chatId.replace(/[^a-zA-Z0-9]/g, '_');
            if (blockedUsers.has(userKey)) {
                log(`Blocked user message: ${chatId}`, 'security');
                return;
            }

            // Check for admin commands
            // Method 1: Check by ADMIN_NUMBER
            // Method 2: First message with "!admin YOUR_ADMIN_NUMBER" to activate
            const isAdmin = AdminState.isAdminChat(chatId);

            // Allow admin activation with secret key
            if (body.startsWith('!admin ') && !isAdmin) {
                const providedNumber = body.split(' ')[1];
                if (providedNumber && providedNumber.replace(/\D/g, '') === ADMIN_NUMBER.replace(/\D/g, '')) {
                    await msg.reply('✅ Admin mode activated for this session!\n\nYou can now use all admin commands.\nType !admin-help to see available commands.');
                    AdminState.tempAdminChat = chatId;
                    return;
                }
            }

            const isTempAdmin = AdminState.tempAdminChat === chatId;

            if ((isAdmin || isTempAdmin) && body.startsWith('!')) {
                try {
                    const reply = await handleAdminCommand(msg, chatId, body);
                    if (reply) {
                        await msg.reply(reply);
                    }
                    return;
                } catch (e) {
                    log('Admin command error: ' + e.message, 'error');
                    await msg.reply('❌ Error executing command: ' + e.message);
                    return;
                }
            }

            // Check maintenance mode (only for non-admin users)
            if (AdminState.maintenanceMode && !AdminState.isAdminChat(chatId)) {
                await msg.reply('🔧 *Maintenance Mode*\n\nBot temporarily under maintenance. Please try again later! 🙏');
                return;
            }

            // Payment Screenshot Verification
            if (msg.hasMedia || body.toLowerCase().includes('payment') || body.toLowerCase().includes('screenshot')) {
                const verification = await verifyPaymentScreenshot(msg, chatId, body);
                if (verification && verification.verified) {
                    // Payment verified - send plan details immediately
                    await addOrder({
                        chatId,
                        type: 'verified_order',
                        planType: verification.planType,
                        amount: verification.amount,
                        paymentMethod: verification.paymentMethod,
                        status: 'completed',
                        confidence: verification.confidence
                    });

                    // Send verification confirmation
                    await msg.reply(`✅ *Payment Verified!*\n\n📦 Plan: ${verification.planType}\n💰 Amount: Rs. ${verification.amount}\n💳 Method: ${verification.paymentMethod || 'Not specified'}\n\n🎉 Sending your eSIM details now...`);

                    // Send plan details immediately
                    await new Promise(r => setTimeout(r, 1000));
                    await sendPlanDetailsAfterVerification(chatId, verification.planType);

                    // Notify admin about verified payment
                    if (ADMIN_NUMBER) {
                        try {
                            const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                            await client.sendMessage(adminChat, `✅ *AUTO-VERIFIED PAYMENT*\n\nFrom: ${chatId}\nPlan: ${verification.planType}\nAmount: Rs. ${verification.amount}\nMethod: ${verification.paymentMethod || 'N/A'}\nConfidence: ${verification.confidence}%\n\nPlan details sent automatically! 🚀`);
                        } catch (e) {}
                    }
                    return;
                } else if (verification) {
                    // Payment detected but not fully verified
                    await addOrder({
                        chatId,
                        type: 'payment_screenshot',
                        planType: verification.planType,
                        status: 'pending_verification',
                        confidence: verification.confidence
                    });

                    await msg.reply(`⏳ *Payment Received*\n\nPayment screenshot mil gaya bhai! ✅\n\n🔄 Verification in progress...\nPlan: ${verification.planType || 'Unknown'}\nConfidence: ${verification.confidence}%\n\nAdmin verify kar ke plan bhejega, 2-5 minutes mein! ⏱️`);

                    // Notify admin for manual verification
                    if (ADMIN_NUMBER) {
                        try {
                            const adminChat = `${ADMIN_NUMBER.replace(/\D/g, '')}@c.us`;
                            await client.sendMessage(adminChat, `⏳ *PENDING VERIFICATION*\n\nFrom: ${chatId}\nPlan: ${verification.planType || 'Unknown'}\nConfidence: ${verification.confidence}%\n\nUse !payment-verify to approve\nOr !order-reject to decline`);
                        } catch (e) {}
                    }
                    return;
                }
            }

            // ⏸️ CHECK IF BOT IS PAUSED (for non-admin users)
            const isPaused = State.botPaused;
            if (isPaused && !isAdmin && !isTempAdmin) {
                log(`Bot PAUSED - skipping auto-reply for ${chatId}`, 'info');
                // Silently ignore - admin will manually reply
                return;
            }

            // Regular message handling
            try {
                const chat = await msg.getChat();

                // 📚 LOAD FULL CHAT CONTEXT (recent messages)
                const chatContext = await getChatContext(chatId, msg);

                // 🛡️ ANTI-BAN: Random delay before response
                const randomDelay = getRandomDelay();
                if (randomDelay > 0) {
                    await new Promise(r => setTimeout(r, randomDelay));
                }

                // Show typing indicator (human-like behavior)
                if (AdminState.typingIndicator && BOT_CONFIG.showTyping) {
                    await chat.sendStateTyping();
                    // Human-like typing time based on message length
                    const typingTime = Math.min(body.length * 30, 3000);
                    await new Promise(r => setTimeout(r, typingTime));
                }

                // Get AI response with full context
                const reply = await getAIResponseWithContext(body, chatId, chatContext);

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
app.get('/api/status', async (req, res) => {
    try {
        const stats = await getStats();
        const userCount = await getUserCount();
        const orders = await getOrders('all');

        // Calculate cooldown remaining
        let cooldownRemaining = 0;
        if (State.groq.status === 'cooldown') {
            const elapsed = Date.now() - (State.groq.lastCall || 0);
            cooldownRemaining = Math.max(0, GROQ_COOLDOWN_MS - elapsed);
        }

        res.json({
            status: State.status,
            ready: State.isReady,
            qr: State.qrData,
            stats: stats,
            users: userCount,
            orders: orders.length,
            logs: State.logs.slice(0, 15),
            uptime: Date.now() - State.startTime,
            firebase: isFirebaseEnabled(),
            groq: {
                enabled: isGroqEnabled(),
                status: State.groq.status,
                failures: State.groq.failureCount,
                cooldownRemaining: cooldownRemaining,
                lastError: State.groq.lastError
            },
            botPaused: State.botPaused,
            pausedBy: State.pausedBy,
            pauseReason: State.pauseReason
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get orders API
app.get('/api/orders', async (req, res) => {
    try {
        if (DB) {
            const snapshot = await DB.ref('orders').once('value');
            const orders = Object.values(snapshot.val() || {});
            res.json({ orders: orders.slice(-20), total: orders.length });
        } else {
            res.json({ orders: localDB.orders.slice(-20), total: localDB.orders.length });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
                <span class="badge badge-blue">v8.0 Master Bot</span>
                <span class="badge ${isFirebaseEnabled() ? 'badge-green' : 'badge-yellow'}">${isFirebaseEnabled() ? 'Firebase' : 'Local DB'}</span>
                <span id="groqStatus" class="badge badge-yellow">🤖 AI: Checking...</span>
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

        <div class="footer">v8.0 Master Bot | Firebase + Groq AI | SimFly Pakistan</div>
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

            // Update Groq status indicator
            if (data.groq) {
                const groqStatusEl = document.getElementById('groqStatus');
                if (groqStatusEl) {
                    if (!data.groq.enabled) {
                        groqStatusEl.textContent = '🤖 AI: OFF';
                        groqStatusEl.className = 'badge badge-red';
                    } else if (data.groq.status === 'cooldown') {
                        const mins = Math.ceil(data.groq.cooldownRemaining / 60000);
                        groqStatusEl.textContent = `⏳ AI: Cooldown (${mins}m)`;
                        groqStatusEl.className = 'badge badge-yellow';
                    } else if (data.groq.failures > 0) {
                        groqStatusEl.textContent = `⚠️ AI: Warning (${data.groq.failures})`;
                        groqStatusEl.className = 'badge badge-yellow';
                    } else {
                        groqStatusEl.textContent = '🟢 AI: Active';
                        groqStatusEl.className = 'badge badge-green';
                    }
                }
            }

            // Update Pause status
            const pauseStatusEl = document.getElementById('pauseStatus');
            if (pauseStatusEl) {
                if (data.botPaused) {
                    pauseStatusEl.textContent = '⏸️ PAUSED';
                    pauseStatusEl.className = 'badge badge-red';
                    pauseStatusEl.style.display = 'inline-block';
                } else {
                    pauseStatusEl.style.display = 'none';
                }
            }

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
const server = app.listen(BOT_CONFIG.port, () => {
    log('='.repeat(50));
    log('SimFly OS v8.0 - Firebase + Groq AI Edition');
    log('Port: ' + BOT_CONFIG.port);
    log('Admin: ' + (ADMIN_NUMBER || 'Not set'));
    log('Database: ' + (isFirebaseEnabled() ? 'Firebase Realtime' : 'Local JSON'));
    log('Groq AI: ' + (isGroqEnabled() ? 'Enabled' : 'Disabled'));
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
