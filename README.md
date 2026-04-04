# SimFly OS v7.0 - Config.js Edition

WhatsApp Sales Bot for SimFly Pakistan (eSIM Provider) - **No .env file needed!**

## What's New in v7.0

✅ **No .env file required** - Everything in `config.js`  
✅ **No Firebase** - Uses local JSON database  
✅ **No external APIs** - Template-based responses  
✅ **Simple setup** - Just edit config.js and run  
✅ **Order tracking** - Built-in order management

## Quick Setup

### Step 1: Edit Config

Open `config.js` and edit these values:

```javascript
// Line 12: Change to your WhatsApp number (with country code)
ADMIN_NUMBER: '923001234567',

// Line 54: Edit your eSIM plans
plans: [
    { name: '500MB', data: '500MB', price: 130, duration: '2 Years', ... },
    { name: '1GB', data: '1GB', price: 400, duration: '2 Years', ... },
    { name: '5GB', data: '5GB', price: 1500, duration: '2 Years', ... }
],

// Line 60: Edit your payment methods
payments: {
    easypaisa: { number: '03466544374', name: 'EasyPaisa', accountName: 'Shafqat' },
    jazzcash: { number: '03456754090', name: 'JazzCash', accountName: 'Shafqat' },
    sadapay: { number: '03116400376', name: 'SadaPay', accountName: 'Abdullah Saahi' }
},
```

### Step 2: Install & Run

```bash
npm install
npm start
```

### Step 3: Scan QR Code

1. Open dashboard at `http://localhost:3000`
2. Scan QR code with WhatsApp (Settings → Linked Devices)
3. Bot is ready!

## Features

- ✅ **WhatsApp Bot** - Auto-reply to customer messages
- ✅ **Smart Responses** - Keyword-based intelligent replies
- ✅ **Order Tracking** - Track orders in local database
- ✅ **Admin Dashboard** - Real-time stats and logs
- ✅ **Payment Detection** - Auto-detect payment screenshots
- ✅ **Local Database** - Auto-saves to JSON file
- ✅ **No External Dependencies** - Works offline

## File Structure

```
simfly-os/
├── config.js          # ALL settings here (edit this!)
├── index.js           # Main bot code
├── data/              # Database folder
│   └── database.json  # Local database
├── package.json
└── README.md
```

## Customization

### Change Bot Responses

Edit `config.js` line 148+:

```javascript
const KEYWORD_RESPONSES = {
    greeting: {
        keywords: ['hi', 'hello', 'assalam'],
        responses: ['Your custom response here!']
    },
    // Add more...
};
```

### Add FAQs

Edit `config.js` line 79+:

```javascript
faqs: {
    'your keyword': 'Your answer here',
    'another question': 'Another answer'
}
```

### Change Business Info

Edit `config.js` line 46-52:

```javascript
const BUSINESS = {
    name: 'Your Business',
    tagline: 'Your Tagline',
    // ...
};
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard |
| `/health` | GET | Health check |
| `/api/status` | GET | Full status |
| `/api/orders` | GET | List orders |
| `/api/send` | POST | Send message |

### Send Message via API

```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"number":"923001234567","message":"Hello!"}'
```

## Deployment

### Railway

```bash
railway login
railway link
railway up
```

### Render

1. Create Web Service
2. Connect GitHub repo
3. Build: `npm install`
4. Start: `npm start`

### Local/Server

```bash
npm install
npm start
```

## Database

All data saves to `data/database.json`:

```json
{
  "conversations": { ... },
  "stats": { "totalMessages": 100, "totalOrders": 10 },
  "users": { ... },
  "orders": [ ... ]
}
```

- Auto-saves every 30 seconds
- Persists between restarts
- No external database needed

## Bot Behavior

1. Customer sends message
2. Bot detects keywords in message
3. Bot sends appropriate response
4. If payment screenshot detected → Notify admin
5. All conversations logged to database

## Admin Features

- **Dashboard**: View QR code, stats, logs
- **Send Messages**: Send messages from dashboard
- **Order Tracking**: View all orders at `/api/orders`
- **Notifications**: Admin gets notified on startup and payments

## Troubleshooting

### Bot not responding
- Check if `ADMIN_NUMBER` is set correctly
- Check logs on dashboard
- Restart: `npm start`

### QR not scanning
- Refresh page
- Check phone internet
- Try "Link Device" instead of "Link a Device"

### Database not saving
- Check `data/` folder exists
- Check file permissions

## Version History

- **v7.0** - Config.js Edition (No .env, No Firebase)
- v6.0 - Simple .env Edition
- v5.2 - Firebase + Groq AI
- v2.1 - Initial release

---

**Built for SimFly Pakistan | Config.js Edition | v7.0**
