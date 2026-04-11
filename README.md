# SimFly OS v5.0

## WhatsApp Sales & Support Bot - Firebase + Railway

SimFly Pakistan's official WhatsApp bot for eSIM sales. Deployed on Railway with Firebase Realtime Database.

---

## Files Structure (Simplified)

```
simfly-os/
├── src/
│   ├── index.js       # Main bot (WhatsApp + Web Server + Handlers)
│   ├── database.js    # Firebase connection + all queries
│   └── services.js    # AI, Vision, Scheduler, Web Server
├── .env.example       # Environment template
├── package.json
└── README.md
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq AI API key |
| `GEMINI_API_KEY_1` | Yes | Gemini API key |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key |
| `FIREBASE_DATABASE_URL` | Yes | Database URL |
| `ADMIN_NUMBER` | Yes | Admin WhatsApp number |
| `PORT` | No | Web server port (default: 3000) |

---

## Deployment

### Railway

1. Push to GitHub
2. Create new Railway project
3. Deploy from GitHub
4. Add all environment variables
5. Done! Web dashboard shows at Railway URL

---

## Plans

| Plan | Data | Price | Validity |
|------|------|-------|----------|
| STARTER | 500MB | Rs 130 | 2 Years |
| STANDARD | 1GB | Rs 350 | 2 Years |
| PRO | 5GB | Rs 1,250 | 2 Years |

---

## Admin Commands

Send via WhatsApp:
- `/orders` - List orders
- `/stock` - View stock
- `/stock 1GB 50` - Update stock
- `/customer 923001234567` - View profile
- `/ban 923001234567` - Ban user
- `/stats` - View stats
- `/pause` - Pause bot
- `/resume` - Resume bot
- `/help` - All commands

---

## License

MIT - SimFly Pakistan
