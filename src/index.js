/**
 * SimFly OS v5.0 - Main Entry Point
 * All-in-one: WhatsApp Bot, Web Server, Firebase
 */

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const { migrate, closeConnection, CustomerQueries, ConversationQueries, OrderQueries, StockQueries, PaymentQueries, AnalyticsQueries } = require('./database');
const { logger, generateResponse, detectIntent, detectIntentLocal, analyzeScreenshot, verifyPayment, initScheduler, setQR, clearQR, setStatus, startWebServer, syncExistingChats } = require('./services');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PLANS = {
  '500MB': { name: 'STARTER', data: '500MB', price: 130, auto: true, code: 'AS48928', icon: '📦' },
  '1GB': { name: 'STANDARD', data: '1GB', price: 350, auto: true, code: 'SA1GB', icon: '📦' },
  '5GB': { name: 'PRO', data: '5GB', price: 1250, auto: false, code: 'FAMILY5G', icon: '💎' }
};

const PAYMENT_METHODS = {
  jazzcash: { number: '03456754090', name: 'JazzCash' },
  easypaisa: { number: '03466544374', name: 'EasyPaisa' },
  sadapay: { number: '03116400376', name: 'SadaPay' }
};

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutting down gracefully...');
  try {
    closeConnection();
    if (client) await client.destroy();
    logger.info('Shutdown complete');
  } catch (err) {
    logger.error('Shutdown error', { error: err.message });
  }
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleMessage(message, client) {
  const number = message.from;
  const text = message.body?.trim() || '';
  const hasImage = message.hasMedia;

  if (number.includes('@g.us')) return;

  const customer = await CustomerQueries.getOrCreate(number, message.notifyName);
  if (customer.banned) return;

  if (text.startsWith('/') && isAdmin(number)) {
    const response = await handleAdminCommand(text, number);
    if (response) await sendMessage(client, number, response);
    return;
  }

  if (hasImage) {
    await handleImage(message, client, customer);
    return;
  }

  if (!text) return;

  const intent = await detectIntent(text);
  await ConversationQueries.add(number, 'user', text, intent, false);
  const response = await routeMessage(text, intent, customer);
  if (response) {
    await sendMessage(client, number, response);
    await ConversationQueries.add(number, 'bot', response, intent, false);
  }
}

async function routeMessage(text, intent, customer) {
  const stage = customer.stage;

  if (stage === 'DELIVERED' || stage === 'SUPPORT') return handleSupport(text, customer);
  if (stage === 'ORDERING' || stage === 'AWAITING_PAYMENT') return continueOrder(text, customer);
  if (stage === 'PAYMENT_SENT') return 'Payment verify ho raha hai bhai. Thora wait karo 😊';

  switch (intent) {
    case 'GREET': return welcome(customer);
    case 'PRICE_ASK': return showPlans();
    case 'PLAN_INTEREST': return planDetails(text);
    case 'COMPAT_CHECK': return checkDevice(text, customer);
    case 'ORDER_READY': await CustomerQueries.updateStage(customer.number, 'ORDERING'); return startOrder(customer);
    case 'SUPPORT': await CustomerQueries.updateStage(customer.number, 'SUPPORT'); return handleSupport(text, customer);
    case 'REFUND_ASK': return handleRefund(customer);
    case 'BYE': return 'Allah Hafiz bhai! Kuch chahiye ho toh message karna 👋';
    default:
      const history = await ConversationQueries.getRecent(customer.number, 5);
      const aiResponse = await generateResponse(text, history, { stage: customer.stage, plan: customer.plan_interest });
      return aiResponse || `Bhai samajh nahi aaya 😅\n\nKya aap:\n1️⃣ Plans dekhna chahte hain\n2️⃣ eSIM lena chahte hain\n3️⃣ Help chahiye`;
  }
}

async function handleImage(message, client, customer) {
  try {
    const media = await message.downloadMedia();
    if (!media || !media.data) {
      await sendMessage(client, message.from, 'Image download nahi hui — dobara bhejo');
      return;
    }

    const imageBuffer = Buffer.from(media.data, 'base64');
    const pendingOrder = await OrderQueries.getPending(customer.number);
    if (!pendingOrder) {
      await sendMessage(client, message.from, 'Bhai pehle plan select karo — konsa plan lena hai?\n\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250');
      return;
    }

    const plan = PLANS[pendingOrder.plan];
    if (!plan) return;

    const analysis = await analyzeScreenshot(imageBuffer, plan.price);
    const existing = await PaymentQueries.getByHash(analysis.hash);
    if (existing) {
      await sendMessage(client, message.from, 'Bhai yeh screenshot pehle use ho chuki hai — fresh payment bhejo');
      return;
    }

    await PaymentQueries.log(customer.number, pendingOrder.order_id, analysis.hash, plan.price);
    const verification = verifyPayment(analysis, plan.price, null);
    if (!verification.valid) {
      await sendMessage(client, message.from, verification.message);
      return;
    }

    await PaymentQueries.verify(analysis.hash, analysis.amount, analysis.recipientNumber, analysis.status);
    await OrderQueries.confirm(pendingOrder.order_id, plan.code, 'eSIM Provider');
    await CustomerQueries.updateStage(customer.number, 'PAYMENT_SENT');

    const delivery = await deliverESIM(customer, pendingOrder, plan);
    await sendMessage(client, message.from, delivery);

    await OrderQueries.deliver(pendingOrder.order_id);
    await CustomerQueries.incrementOrders(customer.number, plan.price);
    await CustomerQueries.updateStage(customer.number, 'DELIVERED');

  } catch (error) {
    console.error('Image handling error:', error);
    await sendMessage(client, message.from, 'Bhai screenshot process nahi ho rahi — dobara bhejo ya text se batao');
  }
}

// ═══════════════════════════════════════════════════════════════
// SALES FLOW
// ═══════════════════════════════════════════════════════════════

function welcome(customer) {
  if (customer.total_orders > 0) {
    return `Welcome back bhai! 😊\n\nPehle aapne ${customer.last_plan || 'plan'} liya tha.\n\nKya chahiye aaj?\n1️⃣ Naya plan\n2️⃣ Support\n3️⃣ Balance check`;
  }
  return `Assalam o Alaikum! 👋\nSimFly Pakistan mein khush aamdeed! 🇵🇰\n\nHumare plans yeh hain:\n\n🟢 STARTER  — 500MB | Rs 130 | 2 Saal\n🔵 STANDARD — 1GB   | Rs 350 | 2 Saal  \n🟣 PRO      — 5GB   | Rs 1,250 | 2 Saal\n\nKaun sa plan pasand hai? 😊`;
}

function showPlans() {
  return `📦 SimFly Pakistan Plans:\n\n🟢 STARTER — 500MB | Rs 130 | 2 Saal\n🔵 STANDARD — 1GB | Rs 350 | 2 Saal\n🟣 PRO — 5GB | Rs 1,250 | 2 Saal (4 Devices)\n\nKaunsa lena hai bhai?`;
}

function planDetails(text) {
  const lower = text.toLowerCase();
  let planId = null;
  if (lower.includes('500') || lower.includes('130') || lower.includes('starter')) planId = '500MB';
  else if (lower.includes('1gb') || lower.includes('350') || lower.includes('standard')) planId = '1GB';
  else if (lower.includes('5gb') || lower.includes('1250') || lower.includes('pro')) planId = '5GB';

  if (!planId) return showPlans();
  const plan = PLANS[planId];
  return `${plan.icon} *${plan.name} Plan*\n\n📊 Data: ${plan.data}\n💰 Price: Rs ${plan.price}\n⏱️ Validity: ${plan.validity}\n📱 Devices: ${plan.devices || 1}\n\n✅ Sirf Rs ${Math.round(plan.price / 730)} per day!\n\nLena hai bhai?`;
}

function checkDevice(text, customer) {
  const lower = text.toLowerCase();
  let device = text.match(/(iphone\s*\d+[\w\s]*)/i)?.[1] || text.match(/(samsung\s*\w+)/i)?.[1] || text.match(/(pixel\s*\d+)/i)?.[1];

  if (!device) {
    return `Bhai aapka kaunsa phone model hai?\n\n✅ Supported:\n📱 iPhone XS, XR, 11, 12, 13, 14, 15, 16\n📱 Samsung S20+, S21+, S22+, S23+, S24+\n📱 Google Pixel 3+\n📱 Fold/Flip series\n\n❌ Not supported:\n🚫 PTA-registered phones\n🚫 iPhone X or below`;
  }

  const deviceLower = device.toLowerCase();
  let compatible = false;

  if (deviceLower.includes('iphone')) {
    const model = deviceLower.match(/iphone\s*(\d+|[xsxr]+)/);
    if (model) {
      const m = model[1];
      if (m === 'xs' || m === 'xr' || parseInt(m) >= 11) compatible = true;
    }
  }
  if (deviceLower.includes('samsung') || deviceLower.includes('galaxy')) {
    const model = deviceLower.match(/s(\d+)/);
    if (model && parseInt(model[1]) >= 20) compatible = true;
    if (deviceLower.includes('fold') || deviceLower.includes('flip')) compatible = true;
  }
  if (deviceLower.includes('pixel')) {
    const model = deviceLower.match(/pixel\s*(\d+)/);
    if (model && parseInt(model[1]) >= 3) compatible = true;
  }

  CustomerQueries.update(customer.number, { device_model: device, is_compatible: compatible ? 1 : 0 });

  if (compatible) {
    return `✅ *${device}* supported hai bhai! 👍\n\nAb konsa plan lena hai?\n🟢 500MB - Rs 130\n🔵 1GB - Rs 350\n🟣 5GB - Rs 1,250`;
  }
  return `❌ *${device}* pe eSIM work nahi karegi bhai\n\n✅ Supported devices:\n• iPhone XS/XR aur above\n• Samsung S20+ aur above\n• Google Pixel 3+`;
}

async function startOrder(customer) {
  const pending = await OrderQueries.getPending(customer.number);
  if (pending) {
    return `Bhai aapka order already pending hai:\n📦 ${pending.plan} - Rs ${pending.amount}\n\nNaya order ke liye pehle wala complete hona chahiye.`;
  }
  return `Perfect bhai! 👍\n\nKaunsa plan lena hai?\n\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250\n\nNumber batao (1, 2, ya 3)`;
}

async function continueOrder(text, customer) {
  const lower = text.toLowerCase().trim();
  let selectedPlan = null;

  if (lower.includes('1') || lower.includes('500') || lower.includes('130')) selectedPlan = '500MB';
  else if (lower.includes('2') || lower.includes('1gb') || lower.includes('350')) selectedPlan = '1GB';
  else if (lower.includes('3') || lower.includes('5gb') || lower.includes('1250')) selectedPlan = '5GB';

  if (!selectedPlan) {
    return `Bhai samajh nahi aaya 😅\n\n1, 2, ya 3 batao:\n1️⃣ 500MB - Rs 130\n2️⃣ 1GB - Rs 350\n3️⃣ 5GB - Rs 1,250`;
  }

  const plan = PLANS[selectedPlan];
  const stock = await StockQueries.get(selectedPlan);
  if (!stock || stock.quantity <= 0) {
    return `Bhai ${plan.name} abhi stock mein nahi hai 😔\n\nAur koi plan chalega?\n🟢 500MB - Rs 130\n🔵 1GB - Rs 350`;
  }

  const orderId = `SF${Date.now().toString(36).toUpperCase()}`;
  await OrderQueries.create(orderId, customer.number, selectedPlan, plan.price);
  await CustomerQueries.update(customer.number, { stage: 'AWAITING_PAYMENT', plan_interest: selectedPlan, last_plan: selectedPlan });

  const { FollowUpQueries } = require('./database');
  const reminderTime = Math.floor(Date.now() / 1000) + (45 * 60);
  await FollowUpQueries.schedule(customer.number, 'PAYMENT_PENDING', `Bhai ${plan.name} ka payment ho gaya? Screenshot bhejni thi 📸`, reminderTime);

  return `✅ *${plan.name} Selected*\n\n📦 Plan: ${plan.data}\n💰 Amount: Rs ${plan.price}\n⏱️ Validity: ${plan.validity}\n\nPayment karo bhai:\n\n💚 JazzCash: ${PAYMENT_METHODS.jazzcash.number}\n💙 EasyPaisa: ${PAYMENT_METHODS.easypaisa.number}\n💜 SadaPay: ${PAYMENT_METHODS.sadapay.number}\n\n(Account: SimFly Pakistan)\n\nScreenshot bhejo yahan 📸`;
}

async function deliverESIM(customer, order, plan) {
  const guide = `━━━━━━━━━━━━━━━━━━━\n📱 *YOUR eSIM DETAILS*\n━━━━━━━━━━━━━━━━━━━\n📦 Plan: ${plan.name}\n📊 Data: ${plan.data}\n⏱️ Validity: ${plan.validity}\n${plan.devices > 1 ? `📱 Devices: ${plan.devices}\n` : ''}\n━━━━━━━━━━━━━━━━━━━\n🎁 *PROMO CODE*\n━━━━━━━━━━━━━━━━━━━\nCode: *${plan.code}*\n\n━━━━━━━━━━━━━━━━━━━\n📲 *ACTIVATION*\n━━━━━━━━━━━━━━━━━━━\n1️⃣ Settings → Mobile Data\n2️⃣ "Add eSIM" tap karo\n3️⃣ Enter code: *${plan.code}*\n4️⃣ Data Roaming ON ✅\n5️⃣ 1-2 minute wait\n\n⚠️ Data Roaming MUST be ON!`;

  if (plan.auto) {
    await StockQueries.decrement(plan.id);
    return `🎉 *Payment Verified!* ✅\n\n${guide}\n\nKoi problem ho toh "support" likh ke bhejo 👍`;
  }
  return `🎉 *Payment Verified!* ✅\n\n5GB plan manual delivery hota hai bhai.\n\nAdmin ko notify kar diya hai — 5-10 minutes mein details mil jayengi 📧\n\nShukriya! 🙏`;
}

function handleSupport(text, customer) {
  const lower = text.toLowerCase();
  if (lower.includes('activate') || lower.includes('chalu')) return `Koi baat nahi! Try karo:\n\n1️⃣ Settings → Mobile Data\n2️⃣ "Add eSIM" tap karo\n3️⃣ Enter code\n4️⃣ Data Roaming ON ✅\n\nPhone model batao agar nahi chalta 👍`;
  if (lower.includes('slow') || lower.includes('speed')) return `eSIM ki speed waisi hi hoti hai.\n\nCheck karo:\n• Signal strength achi hai?\n• Data Roaming ON hai?\n• Flight mode on/off karo`;
  if (lower.includes('data') && lower.includes('khatam')) return `Data khatam ho gaya? 😔\n\nNaya plan lena padega:\n📦 500MB - Rs 130\n📦 1GB - Rs 350\n📦 5GB - Rs 1,250\n\nKaunsa lena hai?`;
  if (lower.includes('not working') || lower.includes('nahi chal')) return `Bhai detail batao:\n1. Phone model kya hai?\n2. Kahan stuck ho rahe ho?\n3. Koi error aa raha hai?\n\nScreenshot bhejo 🙏`;
  return `Main check karke batata hoon bhai.\n\nPhone: ${customer.device_model || 'Unknown'}\nLast order: ${customer.last_plan || 'None'}\n\nExact problem batao?`;
}

async function handleRefund(customer) {
  const pendingOrder = await OrderQueries.getPending(customer.number);
  if (!pendingOrder) return `Bhai refund ke liye order confirm hona chahiye. Aapka koi pending order nahi dikh raha.`;
  if (pendingOrder.status === 'DELIVERED') return `Bhai eSIM already deliver ho chuki hai.\n\nRefund tabhi possible hai jab:\n• eSIM activate nahi hoti\n• Technical issue hamari taraf se`;
  return `Refund request note kar li hai bhai.\n\nAdmin check karega aur 24-48 hours mein response aayega 🙏`;
}

async function sendMessage(client, number, text) {
  try {
    await client.sendPresenceUpdate('composing', number);
    await new Promise(r => setTimeout(r, parseInt(process.env.RESPONSE_DELAY) || 1000));
    await client.sendMessage(number, text);
    await client.sendPresenceUpdate('paused', number);
  } catch (error) {
    console.error('Send message error:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN COMMANDS
// ═══════════════════════════════════════════════════════════════

async function handleAdminCommand(text, number) {
  const parts = text.slice(1).trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'orders': {
      const status = args[0] || 'pending';
      const orders = await OrderQueries.getByStatus(status.toUpperCase(), 20);
      if (orders.length === 0) return `No ${status} orders`;
      return `*${status.toUpperCase()} Orders (${orders.length})*\n\n${orders.map(o => `📦 ${o.order_id}\n   ${o.plan} | Rs ${o.amount}`).join('\n\n')}`;
    }
    case 'stock': {
      if (args.length === 0) {
        const stocks = await StockQueries.getAll();
        return `*Stock*\n\n${stocks.map(s => `📦 ${s.plan}: ${s.quantity} ${s.quantity <= s.low_threshold ? '🔴 LOW' : '✅'}`).join('\n')}`;
      }
      const [plan, qty] = args;
      if (!plan || isNaN(parseInt(qty))) return 'Usage: /stock [plan] [qty]';
      await StockQueries.update(plan.toUpperCase(), parseInt(qty));
      return `✅ ${plan} stock updated to ${qty}`;
    }
    case 'customer': {
      const [num] = args;
      if (!num) return 'Usage: /customer [number]';
      const customer = await CustomerQueries.get(num);
      if (!customer) return `Customer not found`;
      return `*Customer*\n📱 ${customer.number}\n👤 ${customer.name || 'N/A'}\n📊 ${customer.stage}\n📦 ${customer.total_orders} orders\n💰 Rs ${customer.total_spent}`;
    }
    case 'ban': { await CustomerQueries.update(args[0], { banned: 1 }); return `🚫 Banned ${args[0]}`; }
    case 'unban': { await CustomerQueries.update(args[0], { banned: 0 }); return `✅ Unbanned ${args[0]}`; }
    case 'pause': { await getConnection().ref('config/bot_status').set('PAUSED'); return '⏸️ Bot paused'; }
    case 'resume': { await getConnection().ref('config/bot_status').set('ACTIVE'); return '▶️ Bot resumed'; }
    case 'stats': {
      const stats = await OrderQueries.getStats(7);
      return `*Stats (7 days)*\n📦 Total: ${stats.total_orders}\n✅ Delivered: ${stats.delivered}\n💰 Revenue: Rs ${stats.revenue}`;
    }
    case 'help': return `*Admin Commands*\n/orders, /stock, /customer, /ban, /unban, /pause, /resume, /stats`;
    default: return `Unknown: /${command}. Type /help`;
  }
}

function isAdmin(number) {
  const adminNumber = process.env.ADMIN_NUMBER;
  if (!adminNumber) return false;
  const normalizedInput = number.replace(/\D/g, '').replace(/^92/, '0');
  const normalizedAdmin = adminNumber.replace(/\D/g, '').replace(/^92/, '0');
  return normalizedInput.includes(normalizedAdmin) || normalizedAdmin.includes(normalizedInput);
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

logger.info('Initializing SimFly OS v5.0...');
setStatus('INITIALIZING');

migrate().then(() => {
  logger.info('Database initialized');
  logger.info('Service Status', { ai: process.env.GROQ_API_KEY ? 'ENABLED' : 'DISABLED', vision: process.env.GEMINI_API_KEY_1 ? 'ENABLED' : 'DISABLED', mode: process.env.BOT_MODE || 'public' });
}).catch(err => {
  logger.error('Database failed', { error: err.message });
  process.exit(1);
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/session' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote']
  }
});

client.on('qr', (qr) => {
  logger.info('QR Code received');
  qrcode.generate(qr, { small: true });
  setQR(qr);
});

client.on('authenticated', () => {
  logger.info('WhatsApp authenticated');
  clearQR();
  setStatus('AUTHENTICATED');
});

client.on('ready', async () => {
  logger.info('🚀 SimFly OS is ready!');
  setStatus('READY');
  await syncExistingChats(client);
  initScheduler(client);
  await AnalyticsQueries.increment('new_customers', 0);
});

client.on('message', handleMessage);

client.on('disconnected', () => {
  logger.warn('WhatsApp disconnected');
  setStatus('DISCONNECTED');
});

startWebServer();

logger.info('Starting WhatsApp client...');
client.initialize().catch(err => {
  logger.error('Failed to initialize', { error: err.message });
  process.exit(1);
});

module.exports = { client };
