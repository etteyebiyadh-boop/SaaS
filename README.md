# AI WhatsApp Auto-Reply SaaS (MVP)

Production-focused MVP for small local businesses using:
- Node.js
- Express
- SQLite
- Vanilla HTML/CSS
- WhatsApp Cloud API
- OpenAI API

## 1. Project Structure

```txt
.
|-- .env.example
|-- .gitignore
|-- package.json
|-- render.yaml
|-- README.md
|-- data/
|-- public/
|   `-- styles.css
|-- src/
|   |-- db.js
|   |-- server.js
|   |-- middleware/
|   |   `-- auth.js
|   |-- routes/
|   |   |-- auth.js
|   |   |-- dashboard.js
|   |   `-- webhook.js
|   `-- services/
|       |-- ai.js
|       `-- whatsapp.js
`-- views/
    |-- dashboard.ejs
    |-- login.ejs
    `-- signup.ejs
```

## 2. Database Schema (SQLite)

Created automatically on startup in `src/db.js`.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner', 'admin')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  working_hours TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  whatsapp_phone_number_id TEXT UNIQUE,
  whatsapp_access_token TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'paid')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER,
  customer_phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  message_text TEXT NOT NULL,
  wa_message_id TEXT,
  source TEXT NOT NULL DEFAULT 'customer' CHECK(source IN ('customer', 'ai', 'system_limit', 'system')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  usage_date TEXT NOT NULL,
  replies_sent INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, usage_date)
);
```

## 3. API Routes

### Auth + App
- `GET /` -> redirect to login/dashboard
- `GET /signup` -> signup page
- `POST /signup` -> create user with email/password session auth
- `GET /login` -> login page
- `POST /login` -> authenticate user and create session
- `POST /logout` -> destroy session
- `GET /dashboard` -> profile/messages/admin UI
- `POST /business-profile` -> save business profile + WhatsApp credentials
- `POST /admin/business/:businessId/plan` -> toggle `free/paid` plan manually (admin only)

### WhatsApp Webhook
- `GET /webhook/whatsapp` -> Meta webhook verification
- `POST /webhook/whatsapp` -> receive incoming WhatsApp messages, generate reply, send back

## 4. Webhook Logic

`POST /webhook/whatsapp` flow:
1. Validate optional `x-hub-signature-256` using `WHATSAPP_APP_SECRET`.
2. Parse incoming message and phone number ID from webhook payload.
3. Find matching business by `whatsapp_phone_number_id`.
4. Log inbound message in `messages`.
5. Check free-plan limit (`30` AI replies/day via `daily_usage`).
6. If limit reached, send:
   - `Please contact the business owner for more information.`
7. Otherwise generate AI response and send via WhatsApp Cloud API.
8. Log outbound reply and increment usage count for free plan.

## 5. AI Prompt Logic

Implemented in `src/services/ai.js`:
- System role: professional business assistant.
- Hard constraints:
  - answer only from stored business data
  - short, polite, sales-oriented
  - ask for clarification if data is missing
  - no hallucinated prices/services/hours
- Data fed to model:
  - business name
  - description
  - services + prices
  - working hours
  - location
  - contact phone

## 6. Environment Variables

Copy `.env.example` to `.env` and set values:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace_with_a_long_random_string
DATABASE_PATH=./data/app.db
SESSION_DB_PATH=./data/sessions.db

ADMIN_EMAIL=admin@yourdomain.com

OPENAI_API_KEY=sk-xxxx
OPENAI_MODEL=gpt-4o-mini

WHATSAPP_VERIFY_TOKEN=replace_with_webhook_verify_token
WHATSAPP_APP_SECRET=optional_meta_app_secret_for_signature_validation
WHATSAPP_GRAPH_API_VERSION=v22.0
```

## 7. Local Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## 8. Render Deployment

### Quick setup (Blueprint)
1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render reads `render.yaml` and creates the web service with persistent disk.
4. Set required secrets in Render dashboard:
   - `SESSION_SECRET`
   - `OPENAI_API_KEY`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET` (optional but recommended)
   - `ADMIN_EMAIL`
5. Set WhatsApp webhook callback URL to:
   - `https://<your-render-domain>/webhook/whatsapp`
6. Use the same verify token configured in `WHATSAPP_VERIFY_TOKEN`.

### Manual Render settings
- Build command: `npm install`
- Start command: `npm start`
- Add persistent disk mounted at `/var/data`
- Set:
  - `DATABASE_PATH=/var/data/app.db`
  - `SESSION_DB_PATH=/var/data/sessions.db`
  - `NODE_ENV=production`

## 9. Manual Monetization Model

- Free businesses: `30` AI replies/day.
- Paid businesses: unlimited replies.
- Upgrades/downgrades are done by admin from dashboard (manual billing outside the app).
