/**
 * SIMFLY OS v8.0 - MASTER BOT CONFIGURATION
 * All settings in one file - No .env needed!
 * Features: Firebase (optional), Groq AI (optional), Template responses
 */

// ============================================
// MAIN CONFIGURATION
// ============================================
const CONFIG = {
    // Server
    PORT: 3000,
    NODE_ENV: 'production',

    // Admin WhatsApp Number (with country code, no +)
    // Example: '923001234567'
    ADMIN_NUMBER: '923001234567',

    // Bot Name
    BOT_NAME: 'SimFly Bot',

    // ========================================
    // GROQ AI CONFIGURATION (Optional)
    // Get free API key from: https://console.groq.com
    // Leave empty to use template responses only
    // ========================================
    GROQ_API_KEY: '',  // Example: 'gsk_your_key_here'
    GROQ_MODEL: 'llama-3.3-70b-versatile',  // or 'llama-3.1-8b-instant' for faster

    // ========================================
    // FIREBASE CONFIGURATION (Optional)
    // For cloud database - Leave empty to use local JSON only
    // ========================================
    // Option 1: Paste base64 service account here
    FIREBASE_SERVICE_ACCOUNT_BASE64: '',

    // Option 2: Or paste raw JSON (single line)
    FIREBASE_SERVICE_ACCOUNT_JSON: '',

    // Firebase Project Settings (if using Firebase)
    FIREBASE_PROJECT_ID: '',
    FIREBASE_DATABASE_URL: '',
};

// ============================================
// BUSINESS DATA
// ============================================
const BUSINESS = {
    name: 'SimFly Pakistan',
    tagline: 'eSIM for Non-PTA iPhones',
    location: 'Pakistan',
    website: '',
    supportEmail: '',

    // eSIM Plans
    plans: [
        {
            id: 'plan_500mb',
            name: '500MB',
            data: '500MB',
            price: 130,
            duration: '2 Years',
            icon: '⚡',
            popular: false,
            description: 'Basic plan for light usage'
        },
        {
            id: 'plan_1gb',
            name: '1GB',
            data: '1GB',
            price: 400,
            duration: '2 Years',
            icon: '🔥',
            popular: true,
            description: 'Most popular plan'
        },
        {
            id: 'plan_5gb',
            name: '5GB',
            data: '5GB',
            price: 1500,
            duration: '2 Years',
            icon: '💎',
            popular: false,
            devices: 4,
            description: 'Family plan - supports 4 devices'
        }
    ],

    // Payment Methods
    payments: {
        easypaisa: {
            number: '03466544374',
            name: 'EasyPaisa',
            accountName: 'Shafqat',
            instructions: 'Send to EasyPaisa account and share screenshot'
        },
        jazzcash: {
            number: '03456754090',
            name: 'JazzCash',
            accountName: 'Shafqat',
            instructions: 'Send to JazzCash account and share screenshot'
        },
        sadapay: {
            number: '03116400376',
            name: 'SadaPay',
            accountName: 'Abdullah Saahi',
            instructions: 'Send to SadaPay account and share screenshot'
        }
    },

    // Supported Devices
    supportedDevices: [
        'iPhone XS / XR and above',
        'iPhone 11 Series',
        'iPhone 12 Series',
        'iPhone 13 Series',
        'iPhone 14 Series',
        'iPhone 15 Series',
        'iPhone 16 Series',
        'Samsung S20/S21/S22/S23/S24',
        'Google Pixel 4 and above'
    ],

    // FAQs
    faqs: {
        'jv work': 'Han bhai! JV (Japanese Version) iPhone pe eSIM work karti hai. Bas condition yeh hai ke device Non-PTA hona chahiye aur iPhone XS ya us se upar ka model hona chahiye.',
        'pta': 'eSIM sirf Non-PTA devices pe work karti hai. PTA registered devices ke liye available nahi hai.',
        'installation': 'eSIM install karne ke steps:\n1. Payment confirm hone ke baad aapko QR code milega\n2. Settings > Cellular/Mobile Data > Add eSIM\n3. QR code scan karein\n4. Activate karlein',
        'validity': 'Sare plans 2 years (24 months) ke liye valid hain.',
        'refund': 'eSIM digital product hai, isliye payment ke baad refund possible nahi hai.',
        'delivery': 'eSMS instantly deliver hoti hai payment confirm hone ke 5-10 minutes mein.',
        'activation': 'eSMS 24/7 activate ho sakti hain, koi time restriction nahi hai.',
        'japanese': 'Han bhai, Japanese Version (JV) iPhone mein eSIM bilkul work karti hai! iPhone XS/XR se upar ke sab models support karte hain.',
        'usa': 'USA version iPhone Non-PTA ho toh bilkul work karega bhai!',
        'dubai': 'Dubai/Middle East version bhi work karega agar Non-PTA hai.',
        'non pta': 'Non-PTA devices ke liye perfect hai! PTA registered phones pe work nahi karegi.',
        'esim kya hai': 'eSIM ek digital SIM hai jo physical SIM card ki jagah phone ke andar hoti hai. QR code scan karke activate hoti hai.',
        'qr code': 'QR code payment confirm hone ke baad provide kiya jata hai. Usko scan karke eSIM activate hoti hai.',
        'multiple devices': '5GB plan mein 4 devices pe use kar sakte hain. Baqi plans sirf 1 device ke liye hain.',
        'data check': 'Data usage check karne ke liye iPhone mein Settings > Cellular > Cellular Data Usage dekhain.',
        'expire': 'eSIM 2 saal ke baad expire hoti hai. Uske baad new purchase karni paregi.',
        'renew': 'eSIM renew nahi hoti. Expire hone ke baad new purchase karni hoti hai.'
    },

    // Auto-reply messages
    autoReply: {
        paymentReceived: 'Payment screenshot receive ho gaya bhai! ✅\n\nAdmin check kar ke eSIM bana dega, 5-10 minutes mein! ⏱️',
        orderConfirmed: 'Order confirm ho gaya! 🎉\n\nJald hi aapko QR code milega.\n\nShukriya SimFly choose karne ke liye! 🙏',
        outOfStock: 'Sorry bhai, ye plan temporarily out of stock hai. 😔\n\nDoosra plan dekh lain?',
        afterHours: 'Assalam-o-Alaikum! \n\nMain abhi offline hoon. Main jald jawab dunga! 🙏'
    }
};

// ============================================
// AI SYSTEM PROMPT (Used with Groq AI)
// ============================================
const SYSTEM_PROMPT = `You are "Bhai" - SimFly Pakistan's friendly WhatsApp Sales Assistant. You speak like a helpful Pakistani brother.

BUSINESS INFO:
- SimFly Pakistan sells eSIM for Non-PTA iPhones
- Location: Pakistan
- Style: Friendly Pakistani brother ("Bhai")

ESIM PLANS (Always mention these accurately):
⚡ 500MB - Rs. 130 (2 years validity)
🔥 1GB - Rs. 400 (Most Popular, 2 years)
💎 5GB - Rs. 1500 (4 devices support, 2 years)

PAYMENT METHODS:
💳 EasyPaisa: 03466544374
💳 JazzCash: 03456754090
💳 SadaPay: 03116400376

COMMUNICATION RULES:
1. Reply in Roman Urdu + English mix (Pakistani style)
2. Use emojis in every response (1-3 emojis)
3. Keep replies SHORT (1-3 lines max)
4. Be friendly and casual like a Pakistani bhai
5. Always be helpful and welcoming
6. If user asks about prices/plans, give complete info
7. If user is ready to buy, ask for payment method
8. After payment mention, ask for screenshot
9. NEVER give discounts unless explicitly authorized
10. Focus on closing sales
11. Be patient with repetitive questions

IMPORTANT TOPICS YOU HANDLE:
- eSIM plans and pricing
- Payment methods
- Installation help
- JV (Japanese Version) iPhone support
- Non-PTA device compatibility
- Order status
- Technical support for eSIM

RESPONSE STYLE EXAMPLES:
- "Han bhai, bilkul available hai! 😊"
- "1GB plan sab se zyada popular hai, Rs. 400 mein 2 saal ke liye! 🔥"
- "Payment karne ke baad screenshot bhej dein, main foran eSIM bana deta hoon! 📱"
- "Koi masla nahi bhai, main step by step guide bhejta hoon! 👍"

If someone asks about topics NOT related to SimFly/eSIM, politely say:
"Bhai, main sirf SimFly ke eSIM plans ke bare mein help kar sakta hoon. 😊 Koi aur sawal ho toh pooch sakte hain!"

DO NOT:
- Be too formal or robotic
- Give long essays or paragraphs
- Answer non-business questions (politics, religion, personal, etc.)
- Promise discounts or special deals
- Be rude or impatient
- Share any contact info other than payment numbers given above
- Make up information not provided above`;

// ============================================
// KEYWORD RESPONSES (Fast template responses)
// Used when Groq AI is disabled or as fallback
// ============================================
const KEYWORD_RESPONSES = {
    // Greetings
    greeting: {
        keywords: ['hi', 'hello', 'assalam', 'salam', 'hey', 'aoa', 'aslam', 'slm', 'aoa bhai', 'salam bhai', 'hii', 'helo'],
        responses: [
            `Assalam-o-Alaikum bhai! 👋 SimFly Pakistan mein khush amdeed! Main aapki kya madad kar sakta hoon? 😊`,
            `Walaikum Assalam! 🤝 Kaise hain bhai? SimFly ke eSIM plans dekhne hain?`,
            `Salam bhai! 👋 Aaj kya plan lena hai? 500MB, 1GB ya 5GB?`,
            `AoA bhai! 🙏 Kya haal hai? eSIM ke bare mein info chahiye?`
        ]
    },

    // Plans/Pricing
    plans: {
        keywords: ['plan', 'price', 'rate', 'kitne', 'cost', 'rs', 'rupees', 'pese', 'paise', 'daam', '500mb', '1gb', '5gb', 'package', 'packages', 'pricing'],
        responses: [
            `Hamare eSIM Plans:\n\n⚡ 500MB - Rs. 130\n🔥 1GB - Rs. 400 (Sab se zyada popular)\n💎 5GB - Rs. 1500 (4 devices)\n\nSab plans 2 saal ke liye valid hain! 📱\n\nKaunsa plan pasand hai bhai? 🤔`,
            `Bhai hamare plans:\n\n✅ 500MB @ Rs. 130\n✅ 1GB @ Rs. 400\n✅ 5GB @ Rs. 1500 (4 devices)\n\nSare 2 saal ke liye! 🔥\n\nKaunsa lena hai?`
        ]
    },

    // Payment
    payment: {
        keywords: ['payment', 'pay', 'jazzcash', 'easypaisa', 'sadapay', 'bank', 'transfer', 'send', 'bhejo', 'screenshot', 'receipt', 'kesay bhejoon', 'kesay pay', 'kese bhejoon'],
        responses: [
            `Payment Methods:\n\n💳 EasyPaisa: 03466544374\n💳 JazzCash: 03456754090\n💳 SadaPay: 03116400376\n\nPayment karne ke baad screenshot bhej dein bhai! 📱 Jaldi process kar deta hoon! ⚡`,
            `Bhai payment is tarah:\n\nEasyPaisa: 03466544374\nJazzCash: 03456754090\nSadaPay: 03116400376\n\nScreenshot bhej dein payment ka! ✅`
        ]
    },

    // Buy/Order
    order: {
        keywords: ['buy', 'order', 'lena', 'purchase', 'kharid', 'book', 'chahiye', 'do', 'bhejo', 'mangwa', 'dilwa', 'kharido', 'mangwana'],
        responses: [
            `Order karne ke liye bhai:\n\n1️⃣ Plan select karein (500MB/1GB/5GB)\n2️⃣ Payment karein\n3️⃣ Screenshot bhej dein\n\nKaunsa plan lena hai? 🛒`,
            `Bhai aap bas ye bata dein:\n- Kaunsa plan (500MB/1GB/5GB)?\n- Kis number pe chahiye?\n\nPayment confirm hote hi eSIM bana deta hoon! ⚡`,
            `Aasan hai bhai!\n\n✓ Plan choose karein\n✓ Payment karein\n✓ Screenshot bhej dein\n\nMain QR code bana dunga! 📱`
        ]
    },

    // JV Support
    jv: {
        keywords: ['jv', 'japanese', '17 pro', '16 pro', '15 pro', '14 pro', 'work', 'chalega', 'support', 'compatible', 'chalegi', 'chalay ga', 'work karega'],
        responses: [
            `Han bhai! JV (Japanese Version) iPhone pe bilkul work karti hai! ✅\n\nBas ye dekh lain:\n📱 iPhone XS/XR se upar ka model hona chahiye\n📱 Device Non-PTA honi chahiye\n\nKaunsa iPhone hai aapke paas? 🤔`,
            `JV iPhone mein koi masla nahi hai bhai! 😊 eSIM work karegi.\n\n17 Pro Max, 16 Pro Max, 15 Pro Max - sab pe chalti hai! 🔥\n\nPlan lena hai?`,
            `Han bhai JV pe work karti hai! 👍\n\nBas Non-PTA hona chahiye. Kaunsa model hai?`
        ]
    },

    // PTA
    pta: {
        keywords: ['pta', 'registered', 'approved', 'pta registered'],
        responses: [
            `Bhai, eSIM sirf Non-PTA devices pe work karti hai.\n\n❌ PTA registered devices ke liye available nahi hai\n✅ Non-PTA iPhone XS/XR se upar\n\nAapka device Non-PTA hai? 🤔`
        ]
    },

    // Installation
    install: {
        keywords: ['install', 'setup', 'activate', 'use', 'kaise', 'lagaye', 'scan', 'qr', 'lagwani', 'lagwana', 'install karna', 'activate karna', 'setup karna'],
        responses: [
            `eSIM install karna asaan hai bhai:\n\n1️⃣ Payment confirm hone pe QR milega\n2️⃣ Settings > Cellular > Add eSIM\n3️⃣ QR code scan karein\n4️⃣ Done! ✅\n\nMain step-by-step guide bhi bhej deta hoon payment ke baad! 📱`,
            `Installation simple hai:\n\n• QR code scan karein\n• Settings mein ja ke Add eSIM\n• Activate karlein\n\nMain guide bhej dunga! 👍`
        ]
    },

    // Thanks
    thanks: {
        keywords: ['thank', 'shukria', 'shukriya', 'jazak', 'allah', 'tanks', 'thnx', 'shukar', 'jazakallah'],
        responses: [
            `Koi baat nahi bhai! 😊 Allah Pak aapko khush rakhe! 🙏\n\nAur koi sawal ho toh pooch lain! 👍`,
            `Welcome bhai! 🤗 SimFly hamesha aapki service mein hazir hai!\n\nReferral se bhi order karwa sakte hain, commission milta hai! 💰`,
            `Arrey koi masla nahi! 🙏 Allah ne chaha toh sab acha hoga!`
        ]
    },

    // Bye
    bye: {
        keywords: ['bye', 'allah hafiz', 'alvida', 'khuda', 'good night', 'gn', 'good bye', 'allahafiz', 'khuda hafiz'],
        responses: [
            `Allah Hafiz bhai! 🙏\n\nKabhi bhi help chahiye ho, message kar dein! SimFly always online! 📱`,
            `Khuda Hafiz! 🤝 Allah Pak aapko hamesha khush rakhe!\n\nSubha tak bye, phir milenge! 😊`,
            `Allah Hafiz! 🙏 Apna khayal rakhna bhai!`
        ]
    },

    // Help
    help: {
        keywords: ['help', 'madad', 'support', 'guide', 'kya', 'what', 'how', 'kesay', 'kese', 'kese', 'kesa'],
        responses: [
            `Main aapki kya help kar sakta hoon bhai? 🤔\n\n📱 eSIM plans dekhne hain?\n💳 Payment methods janne hain?\n🛒 Order karna hai?\n❓ Koi aur sawal?\n\nBata dein! 😊`,
            `Bhai main yeh help kar sakta hoon:\n\n✓ eSIM plans aur prices\n✓ Payment methods\n✓ Installation guide\n✓ Order status\n\nKya chahiye? 👍`
        ]
    },

    // Human/Agent
    human: {
        keywords: ['human', 'agent', 'real', 'person', 'bande', 'admin', 'manager', 'bande se baat', 'admin se baat'],
        responses: [
            `Bhai, main hi human hoon SimFly ka sales assistant! 😊\n\nAgar koi technical issue ho toh main admin se baat karwa deta hoon.\n\nAapko kya chahiye bhai? Bata dein! 👍`
        ]
    },

    // Device Support
    device: {
        keywords: ['iphone', 'samsung', 'pixel', 'android', 'support', 'mobile', 'phone', 'device', 'model', 'kitne mein'],
        responses: [
            `Supported Devices:\n\n📱 iPhone XS/XR and above\n📱 iPhone 11/12/13/14/15/16 Series\n📱 Samsung S20/S21/S22/S23/S24\n📱 Google Pixel 4 and above\n\nBas device Non-PTA honi chahiye! ✅`,
            `Bhai ye devices support karte hain:\n\niPhone XS/XR se upar\niPhone 11/12/13/14/15/16\nSamsung Galaxy S20/S21/S22/S23/S24\nGoogle Pixel 4+\n\nNon-PTA zaroori hai! 📱`
        ]
    },

    // Contact
    contact: {
        keywords: ['contact', 'number', 'call', 'phone', 'whatsapp', 'reach', 'kahan se', 'kahan'],
        responses: [
            `Aap isi number pe WhatsApp kar sakte hain bhai! 📱\n\nYa agar urgent ho toh admin se baat karwa deta hoon.\n\nKya baat karni hai? 😊`
        ]
    },

    // Delivery Time
    delivery: {
        keywords: ['time', 'kab', 'when', 'delivery', 'kitne der', 'speed', 'jaldi', 'kab milega', 'kitni dair'],
        responses: [
            `Bhai payment confirm hote hi 5-10 minutes mein eSIM bana ke bhej deta hoon! ⚡\n\n24/7 service hai, raat ke 2 baje bhi mil jayegi! 🔥`,
            `Jaldi bhai jaldi! 🚀\n\nPayment ke 5-10 min mein QR code aa jayega!`
        ]
    },

    // Data Usage
    data: {
        keywords: ['data', 'usage', 'mb', 'gb', 'check', 'kitna', 'remaining', 'bacha'],
        responses: [
            `Data usage check karne ke liye:\n\niPhone: Settings > Cellular > Cellular Data\n\nYa phir *#*#... codes hote hain specific carriers ke! 📱`
        ]
    },

    // Expiry
    expiry: {
        keywords: ['expire', 'khatam', 'end', 'validity', 'kab tak', 'kitne din', 'renew'],
        responses: [
            `Bhai sare plans 2 saal (24 months) ke liye valid hain! 📅\n\nExpire hone ke baad new purchase karni paregi.`,
            `2 saal ki validity hai bhai! 💪\n\nMarch 2024 se March 2026 tak chalega!`
        ]
    }
};

// ============================================
// PUPPETEER SETTINGS
// ============================================
const PUPPETEER_CONFIG = {
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ],
    headless: 'new'
};

// ============================================
// DATABASE SETTINGS
// ============================================
const DB_CONFIG = {
    // Directory for local database
    dataDir: './data',
    // Database file name
    dbFile: 'database.json',
    // Auto-save interval in milliseconds
    saveInterval: 30000,
    // Max messages to keep per conversation
    maxMessagesPerChat: 50,
    // Max logs to keep
    maxLogs: 50
};

// ============================================
// BOT BEHAVIOR SETTINGS
// ============================================
const BOT_CONFIG = {
    // Delay before sending reply (milliseconds)
    responseDelay: 1000,
    // Typing indicator duration (milliseconds)
    typingDuration: 1500,
    // Should show typing indicator
    showTyping: true,
    // Max message length for response
    maxMessageLength: 1000,
    // Retry attempts for failed messages
    maxRetries: 3,
    // Should use AI if available
    useAI: true,
    // Should use templates as fallback
    useTemplates: true
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Check if Groq is configured
function isGroqEnabled() {
    return CONFIG.GROQ_API_KEY && CONFIG.GROQ_API_KEY.length > 10;
}

// Check if Firebase is configured
function isFirebaseEnabled() {
    return (CONFIG.FIREBASE_SERVICE_ACCOUNT_BASE64 && CONFIG.FIREBASE_SERVICE_ACCOUNT_BASE64.length > 50) ||
           (CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON && CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON.length > 50);
}

// Get Firebase credentials
function getFirebaseCredentials() {
    if (!isFirebaseEnabled()) return null;

    try {
        // Try base64 first
        if (CONFIG.FIREBASE_SERVICE_ACCOUNT_BASE64 && CONFIG.FIREBASE_SERVICE_ACCOUNT_BASE64.length > 50) {
            const cleaned = CONFIG.FIREBASE_SERVICE_ACCOUNT_BASE64.trim().replace(/\s/g, '');
            return JSON.parse(Buffer.from(cleaned, 'base64').toString());
        }

        // Try raw JSON
        if (CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON && CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON.length > 50) {
            return JSON.parse(CONFIG.FIREBASE_SERVICE_ACCOUNT_JSON);
        }
    } catch (e) {
        console.error('Firebase credentials parse error:', e.message);
    }
    return null;
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
    CONFIG,
    BUSINESS,
    SYSTEM_PROMPT,
    KEYWORD_RESPONSES,
    PUPPETEER_CONFIG,
    DB_CONFIG,
    BOT_CONFIG,
    // Utility functions
    isGroqEnabled,
    isFirebaseEnabled,
    getFirebaseCredentials
};
