# OpenClaw SaaS Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a SaaS platform that wraps OpenClaw as a multi-tenant service with PostgreSQL storage and user dashboard.

**Architecture:** Gateway proxy pattern - platform layer manages users, billing, and settings; OpenClaw runs as shared instance with Agent-per-tenant isolation; Sync Service watches OpenClaw files and syncs to PostgreSQL.

**Tech Stack:** Next.js 14 (App Router), PostgreSQL, Drizzle ORM, shadcn/ui, Tailwind CSS, bcryptjs, jose (JWT), chokidar (file watcher)

---

## Phase 1: Project Initialization

### Task 1.1: Create Next.js Project Structure

**Files:**
- Create: `saas-platform/package.json`
- Create: `saas-platform/tsconfig.json`
- Create: `saas-platform/next.config.js`
- Create: `saas-platform/tailwind.config.ts`
- Create: `saas-platform/.env.example`

**Step 1: Create project directory**

```bash
mkdir -p saas-platform
cd saas-platform
```

**Step 2: Initialize package.json**

```json
{
  "name": "openclaw-saas",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "sync": "tsx sync-service/src/index.ts"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.0",
    "@tanstack/react-query": "^5.0.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.2.0",
    "zod": "^3.22.0",
    "chokidar": "^3.6.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "drizzle-kit": "^0.21.0",
    "tsx": "^4.7.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

module.exports = nextConfig
```

**Step 5: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
    },
  },
  plugins: [],
}
export default config
```

**Step 6: Create .env.example**

```bash
DATABASE_URL=postgres://user:password@localhost:5432/openclaw_saas
JWT_SECRET=your-secret-key-min-32-chars-long
OPENCLAW_STATE_DIR=/Users/you/.openclaw
OPENCLAW_GATEWAY_URL=http://localhost:18789
```

**Step 7: Commit**

```bash
git add saas-platform/
git commit -m "feat(saas): initialize Next.js project structure"
```

---

### Task 1.2: Setup Database Schema with Drizzle

**Files:**
- Create: `saas-platform/src/lib/db/schema.ts`
- Create: `saas-platform/src/lib/db/index.ts`
- Create: `saas-platform/drizzle.config.ts`

**Step 1: Create database connection**

```typescript
// saas-platform/src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString)
export const db = drizzle(client, { schema })
```

**Step 2: Create schema**

```typescript
// saas-platform/src/lib/db/schema.ts
import { pgTable, uuid, varchar, text, timestamp, integer, decimal, boolean, jsonb, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Tenants
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar('agent_id', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Plans
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  priceMonthly: decimal('price_monthly', { precision: 10, scale: 2 }),
  msgLimit: integer('msg_limit'),
  channelLimit: integer('channel_limit'),
  features: jsonb('features'),
})

// Subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  planId: uuid('plan_id').references(() => plans.id).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Usage Logs
export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  period: timestamp('period').notNull(),
  messageCount: integer('message_count').default(0).notNull(),
  tokenCount: integer('token_count').default(0).notNull(),
}, (table) => ({
  tenantPeriodIdx: uniqueIndex('tenant_period_idx').on(table.tenantId, table.period),
}))

// Tenant Configs
export const tenantConfigs = pgTable('tenant_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  configType: varchar('config_type', { length: 50 }).notNull(),
  configKey: varchar('config_key', { length: 100 }).notNull(),
  configValue: jsonb('config_value').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  syncedAt: timestamp('synced_at'),
}, (table) => ({
  tenantConfigIdx: uniqueIndex('tenant_config_idx').on(table.tenantId, table.configType, table.configKey),
}))

// Sessions
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 50 }),
  startedAt: timestamp('started_at'),
  lastMessageAt: timestamp('last_message_at'),
  messageCount: integer('message_count').default(0).notNull(),
  metadata: jsonb('metadata'),
}, (table) => ({
  tenantSessionIdx: uniqueIndex('tenant_session_idx').on(table.tenantId, table.sessionId),
}))

// Messages
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content'),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at').notNull(),
  metadata: jsonb('metadata'),
})

// Session Stats
export const sessionStats = pgTable('session_stats', {
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  period: timestamp('period').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  sessionCount: integer('session_count').default(0).notNull(),
  messageCount: integer('message_count').default(0).notNull(),
  avgResponseTimeMs: integer('avg_response_time_ms'),
}, (table) => ({
  pk: primaryKey({ columns: [table.tenantId, table.period, table.channel] }),
}))
```

**Step 3: Create drizzle config**

```typescript
// saas-platform/drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

**Step 4: Commit**

```bash
git add saas-platform/src/lib/db/ saas-platform/drizzle.config.ts
git commit -m "feat(saas): add PostgreSQL schema with Drizzle ORM"
```

---

### Task 1.3: Setup Authentication System

**Files:**
- Create: `saas-platform/src/lib/auth.ts`
- Create: `saas-platform/src/lib/auth-utils.ts`

**Step 1: Create auth utilities**

```typescript
// saas-platform/src/lib/auth-utils.ts
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export interface TokenPayload {
  userId: string
  email: string
  tenantId: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}
```

**Step 2: Create auth service**

```typescript
// saas-platform/src/lib/auth.ts
import { db } from './db'
import { users, tenants, subscriptions, plans } from './db/schema'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword, signToken, TokenPayload } from './auth-utils'
import crypto from 'crypto'

export interface AuthResult {
  success: boolean
  user?: TokenPayload
  token?: string
  error?: string
}

export async function register(email: string, password: string): Promise<AuthResult> {
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return { success: false, error: 'Email already registered' }
  }

  const passwordHash = await hashPassword(password)
  const userId = crypto.randomUUID()
  const tenantId = `tenant-${userId.slice(0, 8)}`

  try {
    // Create user
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
    })

    // Create tenant
    const [tenant] = await db.insert(tenants).values({
      userId,
      agentId: tenantId,
      displayName: email.split('@')[0],
    }).returning()

    // Get free plan
    const [freePlan] = await db.select().from(plans).where(eq(plans.name, 'free')).limit(1)

    if (freePlan) {
      // Create subscription
      await db.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: freePlan.id,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
    }

    const tokenPayload: TokenPayload = { userId, email, tenantId }
    const token = await signToken(tokenPayload)

    return { success: true, user: tokenPayload, token }
  } catch (error) {
    console.error('Registration error:', error)
    return { success: false, error: 'Registration failed' }
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      agentId: tenants.agentId,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.userId, users.id))
    .where(eq(users.email, email))
    .limit(1)

  if (result.length === 0) {
    return { success: false, error: 'Invalid email or password' }
  }

  const user = result[0]
  const valid = await verifyPassword(password, user.passwordHash)

  if (!valid) {
    return { success: false, error: 'Invalid email or password' }
  }

  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    tenantId: user.agentId,
  }
  const token = await signToken(tokenPayload)

  return { success: true, user: tokenPayload, token }
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/lib/auth.ts saas-platform/src/lib/auth-utils.ts
git commit -m "feat(saas): add authentication system with JWT"
```

---

### Task 1.4: Create Basic App Layout

**Files:**
- Create: `saas-platform/src/app/layout.tsx`
- Create: `saas-platform/src/app/globals.css`
- Create: `saas-platform/src/app/(auth)/login/page.tsx`
- Create: `saas-platform/src/app/(auth)/register/page.tsx`
- Create: `saas-platform/src/app/(dashboard)/layout.tsx`
- Create: `saas-platform/src/app/(dashboard)/page.tsx`

**Step 1: Create root layout**

```tsx
// saas-platform/src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OpenClaw SaaS',
  description: 'Multi-tenant AI assistant platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

**Step 2: Create globals.css**

```css
/* saas-platform/src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**Step 3: Create login page**

```tsx
// saas-platform/src/app/(auth)/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Login failed')
        return
      }

      localStorage.setItem('token', data.token)
      router.push('/')
    } catch {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-md p-8 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-6">Login</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full p-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link href="/register" className="text-primary hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 4: Create register page**

```tsx
// saas-platform/src/app/(auth)/register/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Registration failed')
        return
      }

      localStorage.setItem('token', data.token)
      router.push('/')
    } catch {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-md p-8 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-6">Register</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-primary"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full p-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 5: Create dashboard layout**

```tsx
// saas-platform/src/app/(dashboard)/layout.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  MessageSquare,
  Settings,
  CreditCard,
  BarChart,
  Plug,
  Bot,
  Wrench
} from 'lucide-react'

const navigation = [
  { name: 'Overview', href: '/', icon: Home },
  { name: 'Channels', href: '/channels', icon: Plug },
  { name: 'Models', href: '/models', icon: Bot },
  { name: 'Tools', href: '/tools', icon: Wrench },
  { name: 'Agent', href: '/agent', icon: Settings },
  { name: 'Sessions', href: '/sessions', icon: MessageSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart },
  { name: 'Billing', href: '/billing', icon: CreditCard },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">OpenClaw</h1>
        </div>
        <nav className="p-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

**Step 6: Create dashboard home page**

```tsx
// saas-platform/src/app/(dashboard)/page.tsx
export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Messages Today</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Active Sessions</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="p-6 bg-card rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground">Connected Channels</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>
      </div>
    </div>
  )
}
```

**Step 7: Commit**

```bash
git add saas-platform/src/app/
git commit -m "feat(saas): add basic app layout with auth and dashboard"
```

---

### Task 1.5: Create Auth API Routes

**Files:**
- Create: `saas-platform/src/app/api/auth/login/route.ts`
- Create: `saas-platform/src/app/api/auth/register/route.ts`

**Step 1: Create login API**

```typescript
// saas-platform/src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { login } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = schema.parse(body)

    const result = await login(email, password)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    )
  }
}
```

**Step 2: Create register API**

```typescript
// saas-platform/src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server'
import { register } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = schema.parse(body)

    const result = await register(email, password)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input. Password must be at least 8 characters.' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    )
  }
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/app/api/
git commit -m "feat(saas): add auth API routes"
```

---

## Phase 2: OpenClaw Integration

### Task 2.1: Create OpenClaw CLI Wrapper

**Files:**
- Create: `saas-platform/src/lib/openclaw-cli.ts`

**Step 1: Create CLI wrapper**

```typescript
// saas-platform/src/lib/openclaw-cli.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw'
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || '~/.openclaw'

export class OpenClawCLI {
  private tenantId: string

  constructor(tenantId: string) {
    this.tenantId = tenantId
  }

  private get agentDir(): string {
    return path.join(STATE_DIR.replace('~', process.env.HOME || ''), 'agents', this.tenantId)
  }

  private async exec(command: string): Promise<string> {
    const fullCommand = `${OPENCLAW_BIN} ${command} --agent-dir "${this.agentDir}"`
    try {
      const { stdout } = await execAsync(fullCommand, { timeout: 30000 })
      return stdout.trim()
    } catch (error) {
      console.error(`CLI error: ${fullCommand}`, error)
      throw error
    }
  }

  async initAgent(): Promise<void> {
    await fs.mkdir(this.agentDir, { recursive: true })
    await this.exec('config init')
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.exec(`config set ${key} "${value}"`)
  }

  async getConfig(key: string): Promise<string> {
    return this.exec(`config get ${key}`)
  }

  // Channel operations
  async setChannel(channel: string, config: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(config)) {
      await this.setConfig(`channels.${channel}.${key}`, value)
    }
  }

  async enableChannel(channel: string): Promise<void> {
    await this.setConfig(`channels.${channel}.enabled`, 'true')
  }

  async disableChannel(channel: string): Promise<void> {
    await this.setConfig(`channels.${channel}.enabled`, 'false')
  }

  // Model operations
  async setModel(alias: string, provider: string, model: string): Promise<void> {
    await this.setConfig(`models.${alias}.provider`, provider)
    await this.setConfig(`models.${alias}.model`, model)
  }

  async setApiKey(provider: string, apiKey: string): Promise<void> {
    await this.setConfig(`auth.${provider}.apiKey`, apiKey)
  }

  // Agent operations
  async setSystemPrompt(prompt: string): Promise<void> {
    const tempFile = path.join('/tmp', `prompt-${this.tenantId}-${Date.now()}.txt`)
    await fs.writeFile(tempFile, prompt)
    try {
      await this.exec(`config set agents.default.systemPrompt --file "${tempFile}"`)
    } finally {
      await fs.unlink(tempFile).catch(() => {})
    }
  }

  // Tool operations
  async setToolEnabled(tool: string, enabled: boolean): Promise<void> {
    await this.setConfig(`tools.${tool}.enabled`, String(enabled))
  }
}
```

**Step 2: Commit**

```bash
git add saas-platform/src/lib/openclaw-cli.ts
git commit -m "feat(saas): add OpenClaw CLI wrapper"
```

---

### Task 2.2: Create Sync Service

**Files:**
- Create: `saas-platform/sync-service/src/index.ts`
- Create: `saas-platform/sync-service/src/syncers/session-syncer.ts`
- Create: `saas-platform/sync-service/src/syncers/config-syncer.ts`
- Create: `saas-platform/sync-service/package.json`

**Step 1: Create sync service package.json**

```json
{
  "name": "openclaw-sync-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Create session syncer**

```typescript
// saas-platform/sync-service/src/syncers/session-syncer.ts
import { db } from '../../src/lib/db'
import { sessions, messages } from '../../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import fs from 'fs/promises'
import readline from 'readline'
import { createReadStream } from 'fs'

export async function syncSessionMessages(tenantId: string, filePath: string): Promise<void> {
  // Extract session ID from filename
  const filename = filePath.split('/').pop()!
  const sessionId = filename.replace('.jsonl', '')

  // Ensure session exists
  const existingSessions = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.tenantId, tenantId),
      eq(sessions.sessionId, sessionId)
    ))
    .limit(1)

  if (existingSessions.length === 0) {
    await db.insert(sessions).values({
      tenantId,
      sessionId,
      startedAt: new Date(),
    })
  }

  // Read and parse JSONL file
  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  })

  let messageCount = 0
  let lastMessageAt: Date | null = null

  for await (const line of rl) {
    if (!line.trim()) continue

    try {
      const msg = JSON.parse(line)
      const createdAt = new Date(msg.timestamp || Date.now())

      // Upsert message (simplified - in production would check for duplicates)
      await db.insert(messages).values({
        tenantId,
        sessionId,
        role: msg.role || 'user',
        content: msg.content,
        tokenCount: msg.tokenCount,
        createdAt,
        metadata: msg.metadata,
      }).onConflictDoNothing()

      messageCount++
      lastMessageAt = createdAt
    } catch (e) {
      console.error('Error parsing message line:', e)
    }
  }

  // Update session stats
  if (lastMessageAt) {
    await db
      .update(sessions)
      .set({
        messageCount,
        lastMessageAt,
      })
      .where(and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.sessionId, sessionId)
      ))
  }
}

export async function syncSessionIndex(tenantId: string, filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const sessionsData = JSON.parse(content)

    for (const [sessionId, metadata] of Object.entries(sessionsData)) {
      const meta = metadata as Record<string, any>

      await db
        .insert(sessions)
        .values({
          tenantId,
          sessionId,
          channel: meta.channel,
          startedAt: meta.startedAt ? new Date(meta.startedAt) : null,
          lastMessageAt: meta.updatedAt ? new Date(meta.updatedAt) : null,
          metadata: meta,
        })
        .onConflictDoUpdate({
          target: [sessions.tenantId, sessions.sessionId],
          set: {
            channel: meta.channel,
            lastMessageAt: meta.updatedAt ? new Date(meta.updatedAt) : null,
            metadata: meta,
          },
        })
    }
  } catch (e) {
    console.error('Error syncing session index:', e)
  }
}
```

**Step 3: Create config syncer**

```typescript
// saas-platform/sync-service/src/syncers/config-syncer.ts
import { db } from '../../src/lib/db'
import { tenantConfigs } from '../../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import fs from 'fs/promises'

export async function syncConfig(tenantId: string, filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const config = JSON.parse(content)

    // Sync channels
    if (config.channels) {
      for (const [key, value] of Object.entries(config.channels)) {
        await upsertConfig(tenantId, 'channel', key, value)
      }
    }

    // Sync models
    if (config.models) {
      for (const [key, value] of Object.entries(config.models)) {
        await upsertConfig(tenantId, 'model', key, value)
      }
    }

    // Sync tools
    if (config.tools) {
      for (const [key, value] of Object.entries(config.tools)) {
        await upsertConfig(tenantId, 'tool', key, value)
      }
    }

    // Sync agent settings
    if (config.agents?.default) {
      await upsertConfig(tenantId, 'agent', 'default', config.agents.default)
    }
  } catch (e) {
    console.error('Error syncing config:', e)
  }
}

async function upsertConfig(
  tenantId: string,
  configType: string,
  configKey: string,
  configValue: unknown
): Promise<void> {
  await db
    .insert(tenantConfigs)
    .values({
      tenantId,
      configType,
      configKey,
      configValue: configValue as object,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantConfigs.tenantId, tenantConfigs.configType, tenantConfigs.configKey],
      set: {
        configValue: configValue as object,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    })
}
```

**Step 4: Create main sync service**

```typescript
// saas-platform/sync-service/src/index.ts
import chokidar from 'chokidar'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import { syncSessionMessages, syncSessionIndex } from './syncers/session-syncer'
import { syncConfig } from './syncers/config-syncer'

const OPENCLAW_BASE = (process.env.OPENCLAW_STATE_DIR || '~/.openclaw').replace('~', process.env.HOME || '')

const WATCH_PATTERNS = [
  path.join(OPENCLAW_BASE, 'agents/*/sessions/*.jsonl'),
  path.join(OPENCLAW_BASE, 'agents/*/sessions/sessions.json'),
  path.join(OPENCLAW_BASE, 'openclaw.json'),
]

class SyncService {
  private watcher: chokidar.FSWatcher | null = null
  private recentPlatformWrites = new Set<string>()

  async start(): Promise<void> {
    console.log('Starting Sync Service...')
    console.log('Watching patterns:', WATCH_PATTERNS)

    this.watcher = chokidar.watch(WATCH_PATTERNS, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    })

    this.watcher
      .on('add', (p) => this.handleChange(p))
      .on('change', (p) => this.handleChange(p))
      .on('error', (error) => console.error('Watcher error:', error))

    console.log('Sync Service started')
  }

  private async handleChange(filePath: string): Promise<void> {
    console.log('File changed:', filePath)

    // Check if this was a platform-triggered write
    const fileHash = await this.hashFile(filePath)
    if (this.recentPlatformWrites.has(fileHash)) {
      console.log('Skipping platform-triggered change')
      this.recentPlatformWrites.delete(fileHash)
      return
    }

    const tenantId = this.extractTenantId(filePath)
    if (!tenantId) {
      console.log('Could not extract tenant ID from path:', filePath)
      return
    }

    try {
      if (filePath.endsWith('.jsonl')) {
        await syncSessionMessages(tenantId, filePath)
      } else if (filePath.endsWith('sessions.json')) {
        await syncSessionIndex(tenantId, filePath)
      } else if (filePath.endsWith('openclaw.json')) {
        await syncConfig(tenantId, filePath)
      }
      console.log('Synced:', filePath)
    } catch (error) {
      console.error('Sync error:', error)
    }
  }

  private extractTenantId(filePath: string): string | null {
    const match = filePath.match(/agents\/([^/]+)\//)
    return match ? match[1] : null
  }

  private async hashFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath)
      return crypto.createHash('sha256').update(content).digest('hex')
    } catch {
      return ''
    }
  }

  markPlatformWrite(fileHash: string): void {
    this.recentPlatformWrites.add(fileHash)
    setTimeout(() => this.recentPlatformWrites.delete(fileHash), 5000)
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
    }
  }
}

// Start service
const service = new SyncService()
service.start().catch(console.error)

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await service.stop()
  process.exit(0)
})
```

**Step 5: Commit**

```bash
git add saas-platform/sync-service/
git commit -m "feat(saas): add Sync Service for file-to-DB synchronization"
```

---

### Task 2.3: Create Config API Routes

**Files:**
- Create: `saas-platform/src/app/api/config/route.ts`
- Create: `saas-platform/src/lib/middleware.ts`

**Step 1: Create auth middleware**

```typescript
// saas-platform/src/lib/middleware.ts
import { verifyToken, TokenPayload } from './auth-utils'

export async function requireAuth(request: Request): Promise<TokenPayload> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = authHeader.slice(7)
  const payload = await verifyToken(token)

  if (!payload) {
    throw new Error('Invalid token')
  }

  return payload
}
```

**Step 2: Create config API**

```typescript
// saas-platform/src/app/api/config/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { db } from '@/lib/db'
import { tenantConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { OpenClawCLI } from '@/lib/openclaw-cli'
import { z } from 'zod'

// GET - fetch configs
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    let query = db
      .select()
      .from(tenantConfigs)
      .where(eq(tenantConfigs.tenantId, user.tenantId))

    if (type) {
      query = db
        .select()
        .from(tenantConfigs)
        .where(and(
          eq(tenantConfigs.tenantId, user.tenantId),
          eq(tenantConfigs.configType, type)
        ))
    }

    const configs = await query

    // Transform to key-value format
    const result: Record<string, any> = {}
    for (const config of configs) {
      if (!result[config.configType]) {
        result[config.configType] = {}
      }
      result[config.configType][config.configKey] = {
        ...config.configValue as object,
        enabled: config.enabled,
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PUT - update config
const updateSchema = z.object({
  type: z.enum(['channel', 'model', 'tool', 'agent']),
  key: z.string(),
  value: z.record(z.any()),
})

export async function PUT(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const { type, key, value } = updateSchema.parse(body)

    const cli = new OpenClawCLI(user.tenantId)

    // Apply to OpenClaw via CLI
    switch (type) {
      case 'channel':
        if (value.enabled !== undefined) {
          if (value.enabled) {
            await cli.enableChannel(key)
          } else {
            await cli.disableChannel(key)
          }
        }
        const { enabled, ...channelConfig } = value
        if (Object.keys(channelConfig).length > 0) {
          await cli.setChannel(key, channelConfig)
        }
        break

      case 'model':
        if (value.provider && value.model) {
          await cli.setModel(key, value.provider, value.model)
        }
        if (value.apiKey) {
          await cli.setApiKey(value.provider || key, value.apiKey)
        }
        break

      case 'tool':
        if (value.enabled !== undefined) {
          await cli.setToolEnabled(key, value.enabled)
        }
        break

      case 'agent':
        if (value.systemPrompt) {
          await cli.setSystemPrompt(value.systemPrompt)
        }
        break
    }

    // Update DB immediately (sync service will also pick this up)
    await db
      .insert(tenantConfigs)
      .values({
        tenantId: user.tenantId,
        configType: type,
        configKey: key,
        configValue: value,
        enabled: value.enabled ?? true,
      })
      .onConflictDoUpdate({
        target: [tenantConfigs.tenantId, tenantConfigs.configType, tenantConfigs.configKey],
        set: {
          configValue: value,
          enabled: value.enabled ?? true,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('Config update error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/app/api/config/ saas-platform/src/lib/middleware.ts
git commit -m "feat(saas): add config API routes with OpenClaw CLI integration"
```

---

## Phase 3: Dashboard Pages

### Task 3.1: Create Channels Page

**Files:**
- Create: `saas-platform/src/app/(dashboard)/channels/page.tsx`

**Step 1: Create channels page**

```tsx
// saas-platform/src/app/(dashboard)/channels/page.tsx
'use client'

import { useState, useEffect } from 'react'

const SUPPORTED_CHANNELS = [
  { id: 'telegram', name: 'Telegram', icon: '📱', fields: ['botToken'] },
  { id: 'discord', name: 'Discord', icon: '🎮', fields: ['botToken', 'guildId'] },
  { id: 'slack', name: 'Slack', icon: '💼', fields: ['botToken', 'signingSecret'] },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', fields: ['phoneNumber'] },
]

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetchChannels()
  }, [])

  async function fetchChannels() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/config?type=channel', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setChannels(data.channel || {})
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    } finally {
      setLoading(false)
    }
  }

  async function updateChannel(channelId: string, value: Record<string, any>) {
    setSaving(channelId)
    try {
      const token = localStorage.getItem('token')
      await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'channel',
          key: channelId,
          value,
        }),
      })
      setChannels((prev) => ({
        ...prev,
        [channelId]: { ...prev[channelId], ...value },
      }))
    } catch (error) {
      console.error('Failed to update channel:', error)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Channel Connections</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SUPPORTED_CHANNELS.map((channel) => (
          <div key={channel.id} className="p-6 bg-card rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{channel.icon}</span>
                <h3 className="text-lg font-semibold">{channel.name}</h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={channels[channel.id]?.enabled ?? false}
                  onChange={(e) =>
                    updateChannel(channel.id, { enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="space-y-3">
              {channel.fields.map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    {field}
                  </label>
                  <input
                    type={field.toLowerCase().includes('token') || field.toLowerCase().includes('secret') ? 'password' : 'text'}
                    placeholder={`Enter ${field}`}
                    defaultValue={channels[channel.id]?.[field] || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (channels[channel.id]?.[field] || '')) {
                        updateChannel(channel.id, { [field]: e.target.value })
                      }
                    }}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-primary bg-background"
                  />
                </div>
              ))}
            </div>

            {saving === channel.id && (
              <div className="mt-2 text-sm text-muted-foreground">Saving...</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add saas-platform/src/app/\(dashboard\)/channels/
git commit -m "feat(saas): add channels configuration page"
```

---

### Task 3.2: Create Sessions Page

**Files:**
- Create: `saas-platform/src/app/(dashboard)/sessions/page.tsx`
- Create: `saas-platform/src/app/api/sessions/route.ts`

**Step 1: Create sessions API**

```typescript
// saas-platform/src/app/api/sessions/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { db } from '@/lib/db'
import { sessions, messages } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (sessionId) {
      // Get messages for specific session
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(messages.createdAt)

      return NextResponse.json({ messages: msgs })
    }

    // Get all sessions
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tenantId, user.tenantId))
      .orderBy(desc(sessions.lastMessageAt))
      .limit(50)

    return NextResponse.json({ sessions: sessionList })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**Step 2: Create sessions page**

```tsx
// saas-platform/src/app/(dashboard)/sessions/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'

interface Session {
  id: string
  sessionId: string
  channel: string | null
  messageCount: number
  lastMessageAt: string | null
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sessions</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No sessions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <a
              key={session.id}
              href={`/sessions/${session.sessionId}`}
              className="block p-4 bg-card rounded-lg border hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{session.sessionId}</div>
                  <div className="text-sm text-muted-foreground">
                    {session.channel || 'Unknown channel'} • {session.messageCount} messages
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {session.lastMessageAt
                    ? new Date(session.lastMessageAt).toLocaleDateString()
                    : 'Never'}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/app/\(dashboard\)/sessions/ saas-platform/src/app/api/sessions/
git commit -m "feat(saas): add sessions list page and API"
```

---

## Phase 4: Docker Deployment

### Task 4.1: Create Docker Configuration

**Files:**
- Create: `saas-platform/Dockerfile`
- Create: `saas-platform/docker-compose.yml`

**Step 1: Create Dockerfile**

```dockerfile
# saas-platform/Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**Step 2: Create docker-compose.yml**

```yaml
# saas-platform/docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: openclaw_saas
      POSTGRES_USER: ${DB_USER:-openclaw}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-openclaw}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-openclaw}"]
      interval: 5s
      timeout: 5s
      retries: 5

  openclaw:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install -g openclaw && openclaw gateway run --bind 0.0.0.0 --port 18789"
    environment:
      OPENCLAW_STATE_DIR: /data/openclaw
    volumes:
      - openclaw_data:/data/openclaw
    ports:
      - "18789:18789"
    restart: unless-stopped

  sync-service:
    build:
      context: .
      dockerfile: sync-service/Dockerfile
    environment:
      DATABASE_URL: postgres://${DB_USER:-openclaw}:${DB_PASSWORD:-openclaw}@postgres:5432/openclaw_saas
      OPENCLAW_STATE_DIR: /data/openclaw
    volumes:
      - openclaw_data:/data/openclaw:ro
    depends_on:
      postgres:
        condition: service_healthy
      openclaw:
        condition: service_started
    restart: unless-stopped

  platform:
    build: .
    environment:
      DATABASE_URL: postgres://${DB_USER:-openclaw}:${DB_PASSWORD:-openclaw}@postgres:5432/openclaw_saas
      OPENCLAW_STATE_DIR: /data/openclaw
      OPENCLAW_GATEWAY_URL: http://openclaw:18789
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - openclaw_data:/data/openclaw
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      openclaw:
        condition: service_started
      sync-service:
        condition: service_started
    restart: unless-stopped

volumes:
  postgres_data:
  openclaw_data:
```

**Step 3: Create sync-service Dockerfile**

```dockerfile
# saas-platform/sync-service/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY sync-service/package.json ./
RUN npm install

COPY sync-service/src ./src
COPY src/lib/db ./src/lib/db

CMD ["npm", "start"]
```

**Step 4: Commit**

```bash
git add saas-platform/Dockerfile saas-platform/docker-compose.yml saas-platform/sync-service/Dockerfile
git commit -m "feat(saas): add Docker deployment configuration"
```

---

## Summary

This plan covers:

1. **Phase 1: Project Initialization** (Tasks 1.1-1.5)
   - Next.js project setup
   - PostgreSQL schema with Drizzle
   - Authentication system
   - Basic app layout
   - Auth API routes

2. **Phase 2: OpenClaw Integration** (Tasks 2.1-2.3)
   - CLI wrapper
   - Sync Service
   - Config API routes

3. **Phase 3: Dashboard Pages** (Tasks 3.1-3.2)
   - Channels configuration
   - Sessions list

4. **Phase 4: Docker Deployment** (Task 4.1)
   - Dockerfile
   - docker-compose.yml

Additional pages (Models, Tools, Agent, Analytics, Billing) follow the same pattern as Channels page - can be added incrementally.
