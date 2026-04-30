# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm pages:build      # Cloudflare Pages build

# Code Quality
pnpm lint             # ESLint
pnpm lint:fix         # Auto-fix lint + format
pnpm typecheck        # TypeScript check (no emit)
pnpm format           # Prettier

# Testing
pnpm test             # Run Jest tests
pnpm test:watch       # Jest in watch mode

# Config Generation (run after changing config.json)
pnpm gen:runtime      # Regenerate runtime config
```

Pre-commit hooks (husky + lint-staged) run lint and format automatically on staged files.

## Architecture

MoonTV is a self-hosted video streaming aggregator built on **Next.js 14 App Router**. It searches across 20+ third-party Chinese streaming API sources and provides a unified playback interface. It does not host any video content itself.

### Key Layers

**API Routes** (`src/app/api/`): Each route is a thin handler. Search and detail routes use Edge runtime for caching; auth/user-data routes use Node.js runtime.

**Storage abstraction** (`src/lib/db.ts`): A factory function returns an `IStorage` implementation based on the `STORAGE_TYPE` env var. The four backends — `localstorage` (browser only), `Redis`, `Upstash Redis`, and `Cloudflare D1` — all implement the same interface covering play records, favorites, users, and skip configs.

**Config management** (`src/lib/config.ts`): `config.json` is read at runtime (not build time) in Docker mode, enabling hot-reload of API sources and categories without rebuilding. The server injects config into `window.RUNTIME_CONFIG` for client access.

**Downstream aggregation** (`src/lib/downstream.ts`): Fan-out search across all configured API sources, deduplication, and result merging.

**Client storage** (`src/lib/db.client.ts`): Browser-side localStorage client for play records and favorites when no server storage backend is configured.

**Video playback** (`src/app/play/`): ArtPlayer + HLS.js for HLS streams; supports episode selection, skip-intro configs, and playback progress persistence.

### Deployment Targets

| Platform | Storage Options |
|---|---|
| Docker | localstorage, Redis, Upstash |
| Vercel | localstorage, Upstash |
| Cloudflare Pages | localstorage, D1, Upstash |

### Path Aliases

TypeScript `@/*` maps to `src/*` and `~/*` also maps to `src/*` (see `tsconfig.json`).

### Runtime Config

`config.json` defines API source URLs, cache durations, and custom categories. After modifying it, run `pnpm gen:runtime` to regenerate the derived runtime config. In Docker, this file is read live on each server start.
