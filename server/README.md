# Server (Express + MongoDB)
 
Location: `server/`

Overview
- Node.js + Express API powering MentorAI.
- Mongoose models represent Users, Notes, Decks, Flashcards, Quizzes, TutorSessionSummary, and more.
- Services include AI adapters, PDF parsing, and an SM-2 scheduler.

Run (development)

```bash
cd server
pnpm install
node server.js
```

Environment variables (examples)
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — cookie JWT secret
- `OPENROUTER_API_KEY` — OpenRouter API key (production)
- `OLLAMA_URL` — local Ollama URL (dev)
- `USE_OPENROUTER_IN_PRODUCTION` — set to `true` to prefer OpenRouter
- `PORT` — server port (default 3000)

Important endpoints
- `POST /api/tutor` — streaming tutor chat (SSE)
- `POST /api/flashcards/generate` — generate flashcards from text
- `POST /api/flashcards/review` — submit SM-2 review grade for a card
- `POST /api/upload` — upload PDF and ingest notes
- Auth: cookie-based JWT. See `routes/auth.js`.

Notes and behaviors
- Rate limiting is enforced in `middleware/rateLimiter.js` with special handling for demo accounts and AI actions.
- AI calls are routed through `services/ai.js` which abstracts Ollama vs OpenRouter.
- SSE tokenization and streaming resilience are implemented in `routes/tutor.js`.
