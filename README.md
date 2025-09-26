# Finance + Fitness Monitor (Full-Stack)

Node.js + React dashboard for tracking bank loans/payments (CSV/SMS) and Mi Fitness metrics via Google Fit.

## Monorepo layout
```
finance_fitness_monitor_full/
├─ server/   # Express + SQLite API
└─ client/   # Vite + React + Tailwind UI
```

## Quickstart

### 1) Backend
```bash
cd server
npm i
export JWT_SECRET=devsecret
export GF_CLIENT_ID=your-google-client-id
export GF_CLIENT_SECRET=your-google-client-secret
export GF_REDIRECT=http://localhost:4000/api/fitness/google/callback
npm run dev
```

### 2) Frontend
```bash
cd ../client
npm i
npm run dev
# open http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:4000`.

## Bank data
- Import statements: `POST /api/banks/import/csv` (form-data: file=..., bank=Tinkoff|Sber|GPB)
- Telegram SMS webhook: `POST /api/banks/sms/telegram` (message.text)

## Loans
- `POST /api/loans` – create loan
- `GET  /api/loans/summary` – monthly total + items

## Fitness
- Connect Google Fit: `GET /api/fitness/google/auth`
- Daily metrics: `GET /api/fitness/metrics?day=today|YYYY-MM-DD`

## Auth
- `POST /api/auth/register` – { email, password }
- `POST /api/auth/login` – returns Bearer token (use in `Authorization` header)
