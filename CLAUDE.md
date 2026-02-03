# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarginDesk is an operational finance application for calculating project gross/net margins, managing accruals, allocating overheads, and syncing with Zoho Books/People. It is a single Next.js 15 app (App Router) with TypeScript, Prisma ORM on PostgreSQL, and NextAuth for authentication.

All application code lives under `frontend/`.

## Commands

All commands run from `frontend/`:

```bash
# Development
pnpm run dev              # Start dev server (default port 3000)
pnpm run build            # Production build
pnpm run start            # Start production server

# Quality checks
pnpm run lint             # ESLint (next/core-web-vitals)
pnpm run type-check       # TypeScript strict check (tsc --noEmit)

# Database
pnpm exec prisma migrate dev --name "migration_name"   # Create + apply migration
pnpm exec prisma migrate deploy                         # Apply pending migrations
pnpm exec prisma studio                                 # Database GUI browser
pnpm exec prisma generate                               # Regenerate Prisma Client after schema changes
```

## Tech Stack

- **Framework**: Next.js 15.1.4 (App Router) with React 19
- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm
- **Database**: PostgreSQL via Prisma 6.1
- **Auth**: NextAuth 4 (Microsoft Azure AD + email/password credentials)
- **Styling**: Tailwind CSS 3.4
- **Validation**: Zod 3.24
- **CSV Parsing**: csv-parse (for timesheet/salary imports)

## Architecture

### Directory Layout

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # ~70 API route handlers (server-only)
│   │   ├── auth/               # Sign-in page
│   │   ├── dashboard/          # Dashboard
│   │   ├── clients/            # Client management pages
│   │   ├── projects/           # Project management pages (includes [id] and [id]/config)
│   │   ├── bills/              # Bill viewing
│   │   ├── expenses/           # Expense viewing
│   │   ├── pods/               # Financial pod management (includes [id] and [id]/edit)
│   │   ├── salaries/           # Salary management
│   │   ├── timesheets/         # Timesheet import/viewing
│   │   ├── holidays/           # Holiday management
│   │   ├── reselling-invoices/ # Reselling invoice management
│   │   ├── products/           # Product management
│   │   └── settings/           # Integration settings, exclusion rules, imports
│   ├── components/             # Shared React components (navbar, sidebar, session-provider)
│   ├── lib/                    # Server-side utilities
│   │   ├── auth/               # session.ts (getCurrentUser, RBAC helpers), protect-route.ts
│   │   ├── zoho/               # config.ts, token-manager.ts (OAuth token refresh)
│   │   ├── services/           # utilization.ts (utilization calculations)
│   │   ├── exclusion-rules.ts  # Expense exclusion logic
│   │   └── bill-exclusion-rules.ts
│   └── types/
│       └── next-auth.d.ts      # NextAuth type augmentation (adds role, id to session)
├── prisma/
│   └── schema.prisma           # 30+ models, PostgreSQL
├── public/                     # Static assets
└── package.json
```

### Key Patterns

**Authentication & RBAC**: NextAuth with JWT strategy (30-day sessions). Azure AD users are auto-created as `readonly` role on first login. Four roles: `owner`, `finance`, `pm`, `readonly`. RBAC helpers in `src/lib/auth/session.ts` — use `getCurrentUser()` in API routes and check with `hasRole()`, `isAdmin()`, `canEditAllocations()`, etc.

**API Routes**: All under `src/app/api/`. Standard CRUD pattern — each route file handles GET/POST or GET/PUT/DELETE via exported async functions. Protected by calling `getCurrentUser()` which throws if unauthenticated. `PrismaClient` is instantiated per-file (no shared singleton).

**Data Fetching**: Client-side with `useEffect` + `fetch()`. Pages marked `"use client"` for interactivity. No server components doing data fetching — all data flows through API routes.

**State Management**: React hooks only (`useState`, `useEffect`). No Redux or external state library. NextAuth `useSession()` for client-side auth state.

**Path Alias**: `@/*` maps to `./src/*` (configured in tsconfig.json).

### Database Schema

Prisma schema at `frontend/prisma/schema.prisma`. Core model relationships:

- **Client** → has many **Project** → has **ProjectConfig** (billing model, rates, project type)
- **Project** → has many **Allocation** (person-hours per month), **ProjectCost**, **Invoice**, **PO**
- **Person** → employee records with salary, utilization, and leave tracking
- **FinancialPod** → team groupings via **PodMembership** and **PodProjectMapping**
- **Bill** / **Expense** → synced from Zoho Books, with **ExclusionRule** filtering
- **ResellingInvoice** → OEM reselling with **ResellingBillAllocation** for cost tracking
- **AccrualSnapshot** / **AccrualLine** → month-end frozen financial snapshots
- **User** → app users with role enum (`owner`, `finance`, `pm`, `readonly`)

Key enums: `ProjectType` (hourly_blended, hourly_resource_based, reselling, outsourcing), `ProjectStatus` (draft, active, on_hold, completed, cancelled), `UserRole`.

### External Integrations

- **Zoho Books**: OAuth 2.0 for bill/expense sync. Token manager at `src/lib/zoho/token-manager.ts` handles auto-refresh. Custom fields: `cf_expense_category`, `cf_billed_for_month`.
- **Zoho People**: Employee, leave, manager, and holiday sync.
- **Microsoft Azure AD**: OAuth authentication + optional Microsoft Graph user sync.
- **AWS S3**: Configured for document storage (not yet active).

Integration OAuth callbacks are at `/api/zoho/callback` and `/api/zoho-people/callback`.

## Environment Variables

Required in `frontend/.env`. Template at `frontend/.env.example`. Key groups:

- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — Auth config
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` — Azure AD
- `ZOHO_*` — Zoho Books OAuth credentials and org ID
- Feature flags: `ENABLE_MICROSOFT_SYNC`, `ENABLE_ZOHO_SYNC`, `ENABLE_ON_DEMAND_SYNC`

## Reference Documentation

Detailed specs and setup guides live in the project root:

- `SPECIFICATION.md` — Full system design, data models, business logic rules
- `IMPLEMENTATION_STATUS.md` — What's built, what's working, what's next
- `API_DOCUMENTATION.md` — API endpoint reference
- `LOCAL_DEV_SETUP.md` — Environment setup instructions
