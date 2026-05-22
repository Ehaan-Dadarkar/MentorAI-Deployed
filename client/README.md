# Client (React)

Location: `client/` 

Overview
- Vite + React + TypeScript frontend for MentorAI.
- Uses Tailwind CSS for styling and Framer Motion for UI animation.
- Zustand is used for client state stores (auth, conversation, flashcards, voice recall).

Key files
- `src/App.tsx` — app routing, protected routes, command palette integration
- `src/main.tsx` — app bootstrap
- `src/pages/` — main pages (Dashboard, Tutor, Flashcards, VoiceRecall, Workspace)
- `src/store/` — Zustand stores (conversationStore, flashcardStore, voiceRecallStore, authStore)
- `src/components/` — UI primitives and layout (PageWrapper, Sidebar, modals)

Run (development)

```bash
cd client
pnpm install
pnpm dev
```

Build

```bash
pnpm build
pnpm preview
```

Environment
- `VITE_` prefixed variables may be used; the client expects the backend to be available at relative paths in development.

Notable behaviors
- Tutor sessions consume server SSE streams via `conversationStore.ts`.
- Many AI-backed actions are gated; when the server returns HTTP 402 the `ApiKeyGateModal` prompts the user to add an API key.
