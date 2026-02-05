# SaaS Platform Development Notes

## Overview

Multi-tenant SaaS platform for OpenClaw with PostgreSQL storage, user authentication, and guided onboarding.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 14    │────▶│   PostgreSQL    │◀────│  Sync Service   │
│   Dashboard     │     │   (Drizzle)     │     │   (chokidar)    │
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│    OpenClaw     │◀─────────────┘
                        │    Gateway      │
                        └─────────────────┘
```

## Key Design Decisions

### 1. Gateway Proxy Pattern
- OpenClaw runs as a "black box" engine
- Platform communicates via CLI wrapper (`openclaw-cli.ts`)
- No direct modification to OpenClaw core

### 2. Lazy Agent Initialization
- Agents created on-demand (first test message)
- Reduces resource usage for inactive tenants
- Configurations stored in DB, applied at init time

### 3. File-to-DB Sync
- OpenClaw writes to files (sessions, config)
- Sync service watches files with chokidar
- Changes synced to PostgreSQL for dashboard queries

### 4. Dashboard Lock Pattern
- Overlay blocks dashboard until onboarding complete
- Required steps: API Key + Channel Config + Test
- Optional steps can be skipped

## Database Schema

9 tables:
- `users` - Authentication
- `tenants` - One per user, contains onboardingStatus
- `plans` - Subscription tiers
- `subscriptions` - User subscriptions
- `usage_logs` - Message/token tracking
- `tenant_configs` - Synced from OpenClaw files
- `sessions` - Chat sessions
- `messages` - Session messages
- `session_stats` - Analytics

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account + tenant
- `POST /api/auth/login` - JWT login

### Onboarding
- `GET /api/onboarding/status` - Get wizard progress
- `PUT /api/onboarding/step` - Update step completion
- `POST /api/onboarding/validate-key` - Validate API key
- `POST /api/onboarding/validate-channel` - Validate channel token
- `POST /api/onboarding/test-message` - Test + init agent
- `POST /api/onboarding/complete` - Finish onboarding

### Config
- `GET /api/config` - Get tenant configs
- `PUT /api/config` - Update config (writes to DB + CLI)

### Sessions
- `GET /api/sessions` - List sessions or messages

## Onboarding Flow

```
Register → /onboarding
    ↓
Step 1: Welcome
Step 2: API Key (required) → validate with provider
Step 3: Model Selection
Step 4: Channel Selection
Step 5: Channel Config (required) → validate token
Step 6: System Prompt
Step 7: Test Message (required) → triggers agent init
Step 8: Complete
    ↓
Dashboard (unlocked)
```

## Files Structure

```
saas-platform/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login/Register pages
│   │   ├── (dashboard)/     # Dashboard pages
│   │   ├── (onboarding)/    # Wizard page
│   │   └── api/             # API routes
│   ├── components/
│   │   ├── onboarding/      # 8 step components
│   │   └── DashboardLock.tsx
│   └── lib/
│       ├── db/              # Schema + connection
│       ├── auth.ts          # Auth functions
│       ├── auth-utils.ts    # JWT/password utils
│       ├── middleware.ts    # Auth middleware
│       ├── onboarding.ts    # Onboarding utils
│       ├── openclaw-cli.ts  # CLI wrapper
│       └── utils.ts         # cn() helper
├── sync-service/            # File watcher service
├── docker-compose.yml
└── Dockerfile
```

## TODO / Future Work

- [ ] Add OAuth providers (Google, GitHub)
- [ ] Implement billing/usage tracking
- [ ] Add team/organization support
- [ ] WebSocket for real-time updates
- [ ] Email verification
- [ ] Password reset flow
- [ ] Rate limiting on API endpoints
- [ ] Timeout handling for external API calls
- [ ] More robust error handling

## Commands

```bash
# Development
pnpm install
pnpm dev

# Database
pnpm db:generate   # Generate migrations
pnpm db:migrate    # Run migrations
pnpm db:studio     # Open Drizzle Studio

# Docker
docker-compose up -d
docker-compose logs -f platform

# Production build
pnpm build
pnpm start
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/openclaw
JWT_SECRET=your-secret-key
OPENCLAW_BASE_DIR=/path/to/.openclaw
OPENCLAW_BIN=openclaw
```

## Design Documents

- [SaaS Platform Implementation](../docs/plans/2026-02-03-saas-platform-implementation.md)
- [Onboarding Wizard Design](../docs/plans/2026-02-04-onboarding-wizard-design.md)
- [Onboarding Wizard Implementation](../docs/plans/2026-02-04-onboarding-wizard-implementation.md)
