Backend (Express + MongoDB)

Quick start

1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies:

```
cd backend
npm install
```

3. Run the server:

```
npm run dev
```

Notes

- Mock mode: When `MOCK_MODE=true` (default in `.env.example`), OTPs and social logins are simulated and printed to console for demo/testing.
- MongoDB transactions: Wallet updates attempt to use transactions (requires a replica set). If transactions are not available (standalone mongod), the server falls back to an atomic check-and-update pattern that uses `findOneAndUpdate` with a `{ balance: { $gte: amount } }` filter to ensure race-safety.
