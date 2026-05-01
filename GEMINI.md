# MoonTV Project Context

MoonTV is an out-of-the-box, cross-platform video aggregation player built on **Next.js 14**, **Tailwind CSS**, and **TypeScript**. It aggregates multiple third-party Chinese streaming API sources (AppleCMS V10 standard) and provides a unified, responsive interface for search, playback, and history syncing.

## Core Technologies
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript 4
- **Playback**: ArtPlayer + HLS.js
- **UI Components**: Headless UI, Heroicons, Framer Motion, Lucide React
- **PWA**: `next-pwa`

## Architecture Highlights
- **Storage Abstraction**: Uses an `IStorage` interface in `src/lib/db.ts` to support multiple backends:
  - `localstorage`: Browser-only storage (default).
  - `redis`: Self-hosted Redis.
  - `upstash`: Managed Upstash Redis.
  - `d1`: Cloudflare D1 SQL database.
- **Config Management**: `src/lib/config.ts` merges `config.json` with database-stored admin settings. Supports hot-reload of API sources and categories in Docker mode.
- **Aggregation Logic**: `src/lib/downstream.ts` handles searching across configured API sources, deduplication, and result merging.
- **Authentication**: Cookie-based authentication with HMAC signature verification in `src/middleware.ts`. Supports a master password (`PASSWORD`) and per-user accounts in non-localstorage modes.
- **Deployment**: Optimized for Docker, Vercel, and Cloudflare Pages.

## Directory Structure
- `src/app/`: Next.js App Router pages and API routes.
- `src/components/`: Reusable React components (UI, players, providers).
- `src/lib/`: Core business logic (DB, config, aggregation, auth, utils).
- `scripts/`: Build-time and runtime helper scripts for config and manifest generation.
- `public/`: Static assets and PWA icons.

## Building and Running
- **Development**: `pnpm dev`
- **Build**: `pnpm build`
- **Linting**: `pnpm lint` / `pnpm lint:fix`
- **Typecheck**: `pnpm typecheck`
- **Formatting**: `pnpm format`
- **Testing**: `pnpm test`
- **Runtime Config Gen**: `pnpm gen:runtime` (Run after updating `config.json`)

## Development Conventions
- **Code Style**: ESLint + Prettier (Auto-enforced via Husky pre-commit hooks).
- **Type Safety**: Prefer strict typing; avoid `any` when possible.
- **Modular Logic**: Keep business logic in `src/lib/` and UI in `src/components/`.
- **API Routes**: Search/Detail routes often use Edge runtime for performance; Auth routes use Node.js runtime.
- **Style**: Adhere to Tailwind CSS for all styling; maintain dark/light theme compatibility using `next-themes`.

## Key Files
- `config.json`: Master configuration for API sources and categories.
- `src/lib/types.ts`: Core data models (PlayRecord, Favorite, SearchResult).
- `src/lib/db.ts`: Storage backend factory and manager.
- `src/middleware.ts`: Global authentication and routing logic.
