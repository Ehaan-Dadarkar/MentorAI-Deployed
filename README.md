# MentorAI

![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-Connected-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/Private-Repository-111827)

MentorAI is a full-stack AI learning platform for note-taking, flashcards, quizzes, voice recall, tutoring, and study analytics. It combines a React + Vite frontend, an Express backend, MongoDB Atlas, local AI options, and cloud fallback services to support production deployment on Vercel and Render.

## Features

- AI Tutor for guided explanations and Socratic practice
- Notes with summarization, translation, PDF import, and editing
- Flashcards with spaced repetition and deck management
- Dashboard with study streaks, weak topics, and activity summaries
- Quiz generation, submission, history, and analytics
- Knowledge Graph for connecting notes, concepts, quizzes, flashcards, and voice sessions
- Voice Recall with Whisper-based transcription support

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React | UI and application shell |
| Frontend Tooling | Vite | Fast development and production builds |
| Backend | Node.js | Runtime for the API server |
| Backend Framework | Express | REST API and middleware |
| Database | MongoDB Atlas | Persistent storage for users and study data |
| Local AI | Ollama | Development-time model access |
| Cloud AI | OpenRouter | Production-safe AI fallback |
| Auth | JWT | Cookie-based authentication |

## Live Demo

- https://mentorai.vercel.app

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB Atlas database
- OpenRouter API key
- Optional: Ollama for local development
- Optional: Whisper server for speech transcription

### Installation

1. Clone the repository.
2. Install dependencies in both app folders.
3. Configure environment variables using the example files.
4. Start the backend and frontend locally.

### Environment Setup

Use [server/.env.example](server/.env.example) as the template for backend variables.

Copy it to `server/.env` and fill in the real values for:

- `MONGO_URI`
- `JWT_SECRET`
- `OPENROUTER_API_KEY`
- `NODE_ENV`
- `CLIENT_URL`
- `WHISPER_SERVER_URL`
- `OLLAMA_URL`
- `OLLAMA_MODEL`
- `OPENROUTER_MODEL`
- `DEMO_EMAIL`
- `DEMO_PASSWORD`

For the frontend, use these values:

- [client/.env.development](client/.env.development) for local development
- [client/.env.production](client/.env.production) for deployed builds

### Run Locally

From the project root:

```bash
./start.sh
```

If you prefer manual startup:

```bash
cd server
npm install
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

## Environment Variables

### Backend

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | JWT signing secret |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `NODE_ENV` | Environment mode (`development` or `production`) |
| `CLIENT_URL` | Frontend origin used for CORS and AI requests |
| `WHISPER_SERVER_URL` | Optional local Whisper service URL |
| `OLLAMA_URL` | Optional local Ollama URL |
| `OLLAMA_MODEL` | Local Ollama model name |
| `OPENROUTER_MODEL` | Default OpenRouter model |
| `DEMO_EMAIL` | Demo account email used for the built-in test login |
| `DEMO_PASSWORD` | Demo account password used for the built-in test login |
| `PORT` | Backend port |

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL |

## Deployment

### Frontend: Vercel

- Deploy the `client/` app to Vercel.
- Keep the `client/vercel.json` rewrite so React Router routes work on refresh.
- Set `VITE_API_URL` to the Render backend URL in production.

### Backend: Render

- Deploy the `server/` app as a Node web service on Render.
- Use `render.yaml` to define the service configuration.
- Add all required environment variables in the Render dashboard.
- Production requests fall back to OpenRouter automatically if Ollama is unavailable.

## Screenshots

Add project screenshots here after deployment.

- Dashboard screenshot placeholder
- Notes editor screenshot placeholder
- Flashcards screenshot placeholder
- Tutor / voice recall screenshot placeholder

## Author

Built by Ehaan for the MentorAI project.
