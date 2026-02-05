# Onboarding Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a guided 8-step onboarding wizard with lazy agent initialization, API validation, and dashboard locking.

**Architecture:** Single-page React wizard with stepper UI, API routes for validation/initialization, middleware for route protection, and overlay component for dashboard locking.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, Drizzle ORM, OpenClaw CLI

---

## Task 1: Database Schema Update

**Files:**
- Modify: `saas-platform/src/lib/db/schema.ts`

**Step 1: Add onboardingStatus to tenants table**

```typescript
// Add to tenants table definition, after status field:
onboardingStatus: jsonb('onboarding_status').$type<{
  completed: boolean
  currentStep: number
  steps: {
    welcome: boolean
    apiKey: boolean
    model: boolean
    channelSelect: boolean
    channelConfig: boolean
    systemPrompt: boolean
    tested: boolean
  }
}>().default({
  completed: false,
  currentStep: 1,
  steps: {
    welcome: false,
    apiKey: false,
    model: false,
    channelSelect: false,
    channelConfig: false,
    systemPrompt: false,
    tested: false,
  },
}),
```

**Step 2: Generate migration**

Run: `cd saas-platform && pnpm db:generate`

**Step 3: Commit**

```bash
git add saas-platform/src/lib/db/schema.ts saas-platform/drizzle/
git commit -m "feat(onboarding): add onboardingStatus to tenants schema"
```

---

## Task 2: Onboarding API - Status & Step Update

**Files:**
- Create: `saas-platform/src/app/api/onboarding/status/route.ts`
- Create: `saas-platform/src/app/api/onboarding/step/route.ts`
- Create: `saas-platform/src/lib/onboarding.ts`

**Step 1: Create onboarding utility library**

```typescript
// saas-platform/src/lib/onboarding.ts
import { db } from './db'
import { tenants } from './db/schema'
import { eq } from 'drizzle-orm'

export interface OnboardingStatus {
  completed: boolean
  currentStep: number
  steps: {
    welcome: boolean
    apiKey: boolean
    model: boolean
    channelSelect: boolean
    channelConfig: boolean
    systemPrompt: boolean
    tested: boolean
  }
}

export const DEFAULT_ONBOARDING_STATUS: OnboardingStatus = {
  completed: false,
  currentStep: 1,
  steps: {
    welcome: false,
    apiKey: false,
    model: false,
    channelSelect: false,
    channelConfig: false,
    systemPrompt: false,
    tested: false,
  },
}

export async function getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const [tenant] = await db
    .select({ onboardingStatus: tenants.onboardingStatus })
    .from(tenants)
    .where(eq(tenants.agentId, tenantId))
    .limit(1)

  return (tenant?.onboardingStatus as OnboardingStatus) || DEFAULT_ONBOARDING_STATUS
}

export async function updateOnboardingStep(
  tenantId: string,
  step: keyof OnboardingStatus['steps'],
  value: boolean
): Promise<OnboardingStatus> {
  const current = await getOnboardingStatus(tenantId)

  const updated: OnboardingStatus = {
    ...current,
    steps: {
      ...current.steps,
      [step]: value,
    },
  }

  // Check if all required steps are complete
  const requiredComplete = updated.steps.apiKey && updated.steps.channelConfig && updated.steps.tested
  updated.completed = requiredComplete

  await db
    .update(tenants)
    .set({ onboardingStatus: updated })
    .where(eq(tenants.agentId, tenantId))

  return updated
}

export async function setCurrentStep(tenantId: string, step: number): Promise<void> {
  const current = await getOnboardingStatus(tenantId)
  await db
    .update(tenants)
    .set({ onboardingStatus: { ...current, currentStep: step } })
    .where(eq(tenants.agentId, tenantId))
}
```

**Step 2: Create status API route**

```typescript
// saas-platform/src/app/api/onboarding/status/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { getOnboardingStatus } from '@/lib/onboarding'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = await getOnboardingStatus(auth.user.tenantId)
  return NextResponse.json({ success: true, status })
}
```

**Step 3: Create step update API route**

```typescript
// saas-platform/src/app/api/onboarding/step/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { updateOnboardingStep, setCurrentStep } from '@/lib/onboarding'
import { z } from 'zod'

const stepSchema = z.object({
  step: z.enum(['welcome', 'apiKey', 'model', 'channelSelect', 'channelConfig', 'systemPrompt', 'tested']),
  value: z.boolean(),
  currentStep: z.number().optional(),
})

export async function PUT(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { step, value, currentStep } = stepSchema.parse(body)

    const status = await updateOnboardingStep(auth.user.tenantId, step, value)

    if (currentStep !== undefined) {
      await setCurrentStep(auth.user.tenantId, currentStep)
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
```

**Step 4: Commit**

```bash
git add saas-platform/src/lib/onboarding.ts saas-platform/src/app/api/onboarding/
git commit -m "feat(onboarding): add status and step update APIs"
```

---

## Task 3: API Key Validation Endpoint

**Files:**
- Create: `saas-platform/src/app/api/onboarding/validate-key/route.ts`

**Step 1: Create validate-key API route**

```typescript
// saas-platform/src/app/api/onboarding/validate-key/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { z } from 'zod'

const validateKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(10),
})

async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })
    // 200 = valid, 401 = invalid key, other errors might be rate limit etc.
    return res.status === 200 || res.status === 400 // 400 means key is valid but request issue
  } catch {
    return false
  }
}

async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.status === 200
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { provider, apiKey } = validateKeySchema.parse(body)

    const isValid = provider === 'anthropic'
      ? await validateAnthropicKey(apiKey)
      : await validateOpenAIKey(apiKey)

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 400 })
    }

    return NextResponse.json({ success: true, provider })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
```

**Step 2: Commit**

```bash
git add saas-platform/src/app/api/onboarding/validate-key/route.ts
git commit -m "feat(onboarding): add API key validation endpoint"
```

---

## Task 4: Channel Validation Endpoint

**Files:**
- Create: `saas-platform/src/app/api/onboarding/validate-channel/route.ts`

**Step 1: Create validate-channel API route**

```typescript
// saas-platform/src/app/api/onboarding/validate-channel/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { z } from 'zod'

const validateChannelSchema = z.object({
  channel: z.enum(['telegram', 'discord', 'slack', 'whatsapp']),
  config: z.record(z.string()),
})

async function validateTelegram(token: string): Promise<{ valid: boolean; error?: string; botInfo?: unknown }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (data.ok) {
      return { valid: true, botInfo: data.result }
    }
    return { valid: false, error: data.description || 'Invalid token' }
  } catch {
    return { valid: false, error: 'Failed to connect to Telegram' }
  }
}

async function validateDiscord(token: string): Promise<{ valid: boolean; error?: string; botInfo?: unknown }> {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      return { valid: true, botInfo: data }
    }
    return { valid: false, error: 'Invalid token' }
  } catch {
    return { valid: false, error: 'Failed to connect to Discord' }
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { channel, config } = validateChannelSchema.parse(body)

    let result: { valid: boolean; error?: string; botInfo?: unknown }

    switch (channel) {
      case 'telegram':
        result = await validateTelegram(config.token || '')
        break
      case 'discord':
        result = await validateDiscord(config.token || '')
        break
      case 'slack':
      case 'whatsapp':
        // Simplified validation - just check token format
        result = { valid: (config.token?.length || 0) > 10 }
        break
      default:
        result = { valid: false, error: 'Unknown channel' }
    }

    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, channel, botInfo: result.botInfo })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
```

**Step 2: Commit**

```bash
git add saas-platform/src/app/api/onboarding/validate-channel/route.ts
git commit -m "feat(onboarding): add channel validation endpoint"
```

---

## Task 5: Test Message & Agent Initialization Endpoint

**Files:**
- Create: `saas-platform/src/app/api/onboarding/test-message/route.ts`
- Modify: `saas-platform/src/lib/openclaw-cli.ts`

**Step 1: Add sendMessage method to OpenClawCLI**

Add to `saas-platform/src/lib/openclaw-cli.ts`:

```typescript
// Add to OpenClawCLI class
async sendMessage(message: string): Promise<string> {
  // Use agent command to send message and get response
  const escaped = message.replace(/"/g, '\\"')
  return this.exec(`agent --message "${escaped}" --no-stream`)
}

async isInitialized(): Promise<boolean> {
  try {
    await fs.access(path.join(this.agentDir, 'openclaw.json'))
    return true
  } catch {
    return false
  }
}
```

**Step 2: Create test-message API route**

```typescript
// saas-platform/src/app/api/onboarding/test-message/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { OpenClawCLI } from '@/lib/openclaw-cli'
import { updateOnboardingStep } from '@/lib/onboarding'
import { db } from '@/lib/db'
import { tenantConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const testMessageSchema = z.object({
  message: z.string().min(1).max(1000),
})

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message } = testMessageSchema.parse(body)

    const cli = new OpenClawCLI(auth.user.tenantId)

    // Initialize agent if not already done
    const initialized = await cli.isInitialized()
    if (!initialized) {
      await cli.initAgent()

      // Apply saved configs from database
      const configs = await db
        .select()
        .from(tenantConfigs)
        .where(eq(tenantConfigs.tenantId, auth.user.tenantId))

      for (const config of configs) {
        if (config.configType === 'api_key') {
          await cli.setApiKey(config.configKey, config.configValue as string)
        } else if (config.configType === 'model') {
          const modelConfig = config.configValue as { provider: string; model: string }
          await cli.setModel('default', modelConfig.provider, modelConfig.model)
        } else if (config.configType === 'channel') {
          await cli.setChannel(config.configKey, config.configValue as Record<string, string>)
          await cli.enableChannel(config.configKey)
        } else if (config.configType === 'system_prompt') {
          await cli.setSystemPrompt(config.configValue as string)
        }
      }
    }

    // Send test message
    const response = await cli.sendMessage(message)

    // Mark test step as complete
    await updateOnboardingStep(auth.user.tenantId, 'tested', true)

    return NextResponse.json({ success: true, response })
  } catch (error) {
    console.error('Test message error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/lib/openclaw-cli.ts saas-platform/src/app/api/onboarding/test-message/route.ts
git commit -m "feat(onboarding): add test message endpoint with lazy agent init"
```

---

## Task 6: Complete Onboarding Endpoint

**Files:**
- Create: `saas-platform/src/app/api/onboarding/complete/route.ts`

**Step 1: Create complete API route**

```typescript
// saas-platform/src/app/api/onboarding/complete/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { getOnboardingStatus } from '@/lib/onboarding'
import { db } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = await getOnboardingStatus(auth.user.tenantId)

  // Check required steps
  if (!status.steps.apiKey || !status.steps.channelConfig || !status.steps.tested) {
    return NextResponse.json(
      { success: false, error: 'Please complete all required steps', status },
      { status: 400 }
    )
  }

  // Mark as complete
  await db
    .update(tenants)
    .set({
      onboardingStatus: { ...status, completed: true },
    })
    .where(eq(tenants.agentId, auth.user.tenantId))

  return NextResponse.json({ success: true })
}
```

**Step 2: Commit**

```bash
git add saas-platform/src/app/api/onboarding/complete/route.ts
git commit -m "feat(onboarding): add complete endpoint"
```

---

## Task 7: Stepper Component

**Files:**
- Create: `saas-platform/src/components/onboarding/Stepper.tsx`

**Step 1: Create Stepper component**

```typescript
// saas-platform/src/components/onboarding/Stepper.tsx
'use client'

import { cn } from '@/lib/utils'

interface Step {
  id: number
  name: string
  completed: boolean
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (step: number) => void
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            {/* Step circle */}
            <button
              onClick={() => onStepClick?.(step.id)}
              disabled={!step.completed && step.id > currentStep}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step.id === currentStep && 'bg-primary text-primary-foreground',
                step.completed && step.id !== currentStep && 'bg-green-500 text-white',
                !step.completed && step.id !== currentStep && 'bg-muted text-muted-foreground',
                step.completed && 'cursor-pointer hover:opacity-80',
              )}
            >
              {step.completed && step.id !== currentStep ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.id
              )}
            </button>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  step.completed ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-between mt-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'text-xs text-center flex-1',
              step.id === currentStep ? 'text-primary font-medium' : 'text-muted-foreground'
            )}
          >
            {step.name}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Create utils if not exists**

```typescript
// saas-platform/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/components/onboarding/Stepper.tsx saas-platform/src/lib/utils.ts
git commit -m "feat(onboarding): add Stepper component"
```

---

## Task 8: Step Components (Welcome, ApiKey, Model)

**Files:**
- Create: `saas-platform/src/components/onboarding/WelcomeStep.tsx`
- Create: `saas-platform/src/components/onboarding/ApiKeyStep.tsx`
- Create: `saas-platform/src/components/onboarding/ModelStep.tsx`

**Step 1: Create WelcomeStep**

```typescript
// saas-platform/src/components/onboarding/WelcomeStep.tsx
'use client'

interface WelcomeStepProps {
  onNext: () => void
}

const features = [
  { icon: '💬', title: 'Multi-Channel', desc: 'Connect Telegram, Discord, Slack, WhatsApp' },
  { icon: '🤖', title: 'AI Assistant', desc: 'Powered by Claude or GPT-4' },
  { icon: '⚡', title: 'Always On', desc: 'Your assistant runs 24/7' },
  { icon: '🔒', title: 'Private', desc: 'Your data stays secure' },
]

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center py-8">
      <h1 className="text-3xl font-bold mb-4">Welcome to OpenClaw</h1>
      <p className="text-muted-foreground mb-8">
        Your personal AI assistant across all messaging platforms
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {features.map((feature) => (
          <div key={feature.title} className="p-4 bg-muted rounded-lg">
            <div className="text-3xl mb-2">{feature.icon}</div>
            <h3 className="font-medium">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
      >
        Start Setup
      </button>
    </div>
  )
}
```

**Step 2: Create ApiKeyStep**

```typescript
// saas-platform/src/components/onboarding/ApiKeyStep.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ApiKeyStepProps {
  onNext: (data: { provider: string; apiKey: string }) => void
  onSkip: () => void
}

export function ApiKeyStep({ onNext, onSkip }: ApiKeyStepProps) {
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  async function handleValidate() {
    setValidating(true)
    setError('')

    try {
      const res = await fetch('/api/onboarding/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ provider, apiKey }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Invalid API key')
        return
      }

      onNext({ provider, apiKey })
    } catch {
      setError('Failed to validate API key')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">API Key Setup</h2>
      <p className="text-muted-foreground mb-6">
        Connect your AI provider to power your assistant
      </p>

      {/* Provider tabs */}
      <div className="flex gap-2 mb-6">
        {(['anthropic', 'openai'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg font-medium capitalize',
              provider === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT)'}
          </button>
        ))}
      </div>

      {/* API Key input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">API Key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            className="w-full p-3 pr-20 border rounded-lg focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <details className="mb-6">
        <summary className="text-sm text-primary cursor-pointer">
          How to get an API key?
        </summary>
        <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
          {provider === 'anthropic' ? (
            <p>
              Visit{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                console.anthropic.com
              </a>{' '}
              to create an API key.
            </p>
          ) : (
            <p>
              Visit{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                platform.openai.com
              </a>{' '}
              to create an API key.
            </p>
          )}
        </div>
      </details>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={handleValidate}
          disabled={!apiKey || validating}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate & Continue'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Create ModelStep**

```typescript
// saas-platform/src/components/onboarding/ModelStep.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ModelStepProps {
  provider: string
  onNext: (model: string) => void
  onSkip: () => void
}

const MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Best balance of speed and intelligence', recommended: true },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', desc: 'Most capable, slower responses' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', desc: 'Fastest, good for simple tasks' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', desc: 'Latest multimodal model', recommended: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', desc: 'Powerful with vision capabilities' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', desc: 'Fast and cost-effective' },
  ],
}

export function ModelStep({ provider, onNext, onSkip }: ModelStepProps) {
  const models = MODELS[provider as keyof typeof MODELS] || MODELS.anthropic
  const [selected, setSelected] = useState(models.find((m) => m.recommended)?.id || models[0].id)

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Choose Your Model</h2>
      <p className="text-muted-foreground mb-6">
        Select the AI model for your assistant
      </p>

      <div className="space-y-3 mb-6">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => setSelected(model.id)}
            className={cn(
              'w-full p-4 rounded-lg border text-left transition-colors',
              selected === model.id
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{model.name}</span>
              {model.recommended && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{model.desc}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={() => onNext(selected)}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add saas-platform/src/components/onboarding/
git commit -m "feat(onboarding): add Welcome, ApiKey, Model step components"
```

---

## Task 9: Step Components (Channel Select, Channel Config)

**Files:**
- Create: `saas-platform/src/components/onboarding/ChannelSelectStep.tsx`
- Create: `saas-platform/src/components/onboarding/ChannelConfigStep.tsx`

**Step 1: Create ChannelSelectStep**

```typescript
// saas-platform/src/components/onboarding/ChannelSelectStep.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ChannelSelectStepProps {
  onNext: (channel: string) => void
  onSkip: () => void
}

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', icon: '✈️', desc: 'Bots via @BotFather' },
  { id: 'discord', name: 'Discord', icon: '🎮', desc: 'Server and DM bots' },
  { id: 'slack', name: 'Slack', icon: '💼', desc: 'Workspace integration' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', desc: 'Business API' },
]

export function ChannelSelectStep({ onNext, onSkip }: ChannelSelectStepProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Choose a Channel</h2>
      <p className="text-muted-foreground mb-6">
        Where do you want your assistant to respond?
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            onClick={() => setSelected(channel.id)}
            className={cn(
              'p-4 rounded-lg border text-center transition-colors',
              selected === channel.id
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50'
            )}
          >
            <div className="text-3xl mb-2">{channel.icon}</div>
            <div className="font-medium">{channel.name}</div>
            <div className="text-xs text-muted-foreground">{channel.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground text-center mb-6">
        You can add more channels later in the Dashboard
      </p>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Create ChannelConfigStep**

```typescript
// saas-platform/src/components/onboarding/ChannelConfigStep.tsx
'use client'

import { useState } from 'react'

interface ChannelConfigStepProps {
  channel: string
  onNext: (config: Record<string, string>) => void
  onSkip: () => void
}

const CHANNEL_FIELDS: Record<string, { label: string; placeholder: string; help: string }[]> = {
  telegram: [
    {
      label: 'Bot Token',
      placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
      help: 'Get this from @BotFather on Telegram',
    },
  ],
  discord: [
    {
      label: 'Bot Token',
      placeholder: 'your-discord-bot-token',
      help: 'Get this from Discord Developer Portal',
    },
  ],
  slack: [
    {
      label: 'Bot Token',
      placeholder: 'xoxb-...',
      help: 'Get this from Slack App settings',
    },
  ],
  whatsapp: [
    {
      label: 'Phone Number ID',
      placeholder: '1234567890',
      help: 'From WhatsApp Business API',
    },
    {
      label: 'Access Token',
      placeholder: 'EAAG...',
      help: 'From Meta Developer Portal',
    },
  ],
}

export function ChannelConfigStep({ channel, onNext, onSkip }: ChannelConfigStepProps) {
  const fields = CHANNEL_FIELDS[channel] || CHANNEL_FIELDS.telegram
  const [values, setValues] = useState<Record<string, string>>({})
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  async function handleValidate() {
    setValidating(true)
    setError('')

    try {
      const config: Record<string, string> = {}
      fields.forEach((field, index) => {
        config[index === 0 ? 'token' : field.label.toLowerCase().replace(/\s+/g, '_')] =
          values[field.label] || ''
      })

      const res = await fetch('/api/onboarding/validate-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ channel, config }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Invalid configuration')
        return
      }

      onNext(config)
    } catch {
      setError('Failed to validate channel')
    } finally {
      setValidating(false)
    }
  }

  const allFieldsFilled = fields.every((field) => values[field.label]?.trim())

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2 capitalize">{channel} Setup</h2>
      <p className="text-muted-foreground mb-6">
        Enter your {channel} bot credentials
      </p>

      <div className="space-y-4 mb-6">
        {fields.map((field) => (
          <div key={field.label}>
            <label className="block text-sm font-medium mb-1">{field.label}</label>
            <input
              type="password"
              value={values[field.label] || ''}
              onChange={(e) => setValues({ ...values, [field.label]: e.target.value })}
              placeholder={field.placeholder}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{field.help}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={handleValidate}
          disabled={!allFieldsFilled || validating}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate & Continue'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/components/onboarding/
git commit -m "feat(onboarding): add ChannelSelect and ChannelConfig step components"
```

---

## Task 10: Step Components (SystemPrompt, Test, Complete)

**Files:**
- Create: `saas-platform/src/components/onboarding/SystemPromptStep.tsx`
- Create: `saas-platform/src/components/onboarding/TestStep.tsx`
- Create: `saas-platform/src/components/onboarding/CompleteStep.tsx`

**Step 1: Create SystemPromptStep**

```typescript
// saas-platform/src/components/onboarding/SystemPromptStep.tsx
'use client'

import { useState } from 'react'

interface SystemPromptStepProps {
  onNext: (prompt: string) => void
  onSkip: () => void
}

const DEFAULT_PROMPT = `You are a friendly and helpful AI assistant. You provide clear, concise, and accurate responses. You're conversational but professional, and always try to be helpful.`

export function SystemPromptStep({ onNext, onSkip }: SystemPromptStepProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">System Prompt</h2>
      <p className="text-muted-foreground mb-6">
        Customize your assistant's personality and behavior
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary resize-none"
          placeholder="Describe how your assistant should behave..."
        />
      </div>

      <button
        onClick={() => setPrompt(DEFAULT_PROMPT)}
        className="text-sm text-primary hover:underline mb-6 block"
      >
        Reset to default
      </button>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip (use default)
        </button>
        <button
          onClick={() => onNext(prompt)}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Create TestStep**

```typescript
// saas-platform/src/components/onboarding/TestStep.tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface TestStepProps {
  onNext: () => void
}

export function TestStep({ onNext }: TestStepProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setSending(true)

    try {
      const res = await fetch('/api/onboarding/test-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ message: userMessage }),
      })

      const data = await res.json()

      if (data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
        setSuccess(true)
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.error || 'Failed to get response'}` },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Failed to send message' },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Test Your Assistant</h2>
      <p className="text-muted-foreground mb-6">
        Send a message to make sure everything works
      </p>

      {/* Chat area */}
      <div className="h-64 border rounded-lg mb-4 flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Send a message to test your assistant
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-2 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Setup successful! Your assistant is working.
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!success}
        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      >
        {success ? 'Continue' : 'Send a message to continue'}
      </button>
    </div>
  )
}
```

**Step 3: Create CompleteStep**

```typescript
// saas-platform/src/components/onboarding/CompleteStep.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface CompleteStepProps {
  config: {
    provider?: string
    model?: string
    channel?: string
  }
}

export function CompleteStep({ config }: CompleteStepProps) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)

    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })

      router.push('/')
    } catch {
      setCompleting(false)
    }
  }

  return (
    <div className="py-8 max-w-md mx-auto text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
      <p className="text-muted-foreground mb-8">
        Your OpenClaw assistant is ready to use
      </p>

      <div className="bg-muted rounded-lg p-4 mb-8 text-left">
        <h3 className="font-medium mb-3">Setup Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Provider</span>
            <span className="capitalize">{config.provider || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Model</span>
            <span>{config.model || 'Default'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Channel</span>
            <span className="capitalize">{config.channel || 'Not set'}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      >
        {completing ? 'Loading...' : 'Go to Dashboard'}
      </button>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add saas-platform/src/components/onboarding/
git commit -m "feat(onboarding): add SystemPrompt, Test, Complete step components"
```

---

## Task 11: Onboarding Wizard Page

**Files:**
- Create: `saas-platform/src/app/(onboarding)/onboarding/page.tsx`
- Create: `saas-platform/src/app/(onboarding)/layout.tsx`

**Step 1: Create onboarding layout**

```typescript
// saas-platform/src/app/(onboarding)/layout.tsx
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
```

**Step 2: Create onboarding page**

```typescript
// saas-platform/src/app/(onboarding)/onboarding/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Stepper } from '@/components/onboarding/Stepper'
import { WelcomeStep } from '@/components/onboarding/WelcomeStep'
import { ApiKeyStep } from '@/components/onboarding/ApiKeyStep'
import { ModelStep } from '@/components/onboarding/ModelStep'
import { ChannelSelectStep } from '@/components/onboarding/ChannelSelectStep'
import { ChannelConfigStep } from '@/components/onboarding/ChannelConfigStep'
import { SystemPromptStep } from '@/components/onboarding/SystemPromptStep'
import { TestStep } from '@/components/onboarding/TestStep'
import { CompleteStep } from '@/components/onboarding/CompleteStep'

const STEPS = [
  { id: 1, name: 'Welcome', key: 'welcome' },
  { id: 2, name: 'API Key', key: 'apiKey' },
  { id: 3, name: 'Model', key: 'model' },
  { id: 4, name: 'Channel', key: 'channelSelect' },
  { id: 5, name: 'Config', key: 'channelConfig' },
  { id: 6, name: 'Prompt', key: 'systemPrompt' },
  { id: 7, name: 'Test', key: 'tested' },
  { id: 8, name: 'Done', key: 'complete' },
]

interface Config {
  provider?: string
  apiKey?: string
  model?: string
  channel?: string
  channelConfig?: Record<string, string>
  systemPrompt?: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({})
  const [config, setConfig] = useState<Config>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check auth and load existing status
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetch('/api/onboarding/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.status) {
          setCompletedSteps(data.status.steps)
          setCurrentStep(data.status.currentStep || 1)
          if (data.status.completed) {
            router.push('/')
          }
        }
        setLoading(false)
      })
      .catch(() => {
        router.push('/login')
      })
  }, [router])

  async function saveStep(step: string, value: boolean, nextStep?: number) {
    const token = localStorage.getItem('token')
    await fetch('/api/onboarding/step', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ step, value, currentStep: nextStep }),
    })
    setCompletedSteps((prev) => ({ ...prev, [step]: value }))
    if (nextStep) setCurrentStep(nextStep)
  }

  async function saveConfig(type: string, key: string, value: unknown) {
    const token = localStorage.getItem('token')
    await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ configType: type, configKey: key, configValue: value }),
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const steps = STEPS.map((s) => ({
    ...s,
    completed: completedSteps[s.key] || false,
  }))

  function handleStepClick(stepId: number) {
    if (stepId <= currentStep || steps[stepId - 1]?.completed) {
      setCurrentStep(stepId)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 border-b">
        <div className="max-w-2xl mx-auto">
          <Stepper steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="max-w-2xl mx-auto">
          {currentStep === 1 && (
            <WelcomeStep
              onNext={() => {
                saveStep('welcome', true, 2)
              }}
            />
          )}

          {currentStep === 2 && (
            <ApiKeyStep
              onNext={async (data) => {
                setConfig((prev) => ({ ...prev, ...data }))
                await saveConfig('api_key', data.provider, data.apiKey)
                await saveStep('apiKey', true, 3)
              }}
              onSkip={() => saveStep('apiKey', false, 3)}
            />
          )}

          {currentStep === 3 && (
            <ModelStep
              provider={config.provider || 'anthropic'}
              onNext={async (model) => {
                setConfig((prev) => ({ ...prev, model }))
                await saveConfig('model', 'default', { provider: config.provider, model })
                await saveStep('model', true, 4)
              }}
              onSkip={() => saveStep('model', false, 4)}
            />
          )}

          {currentStep === 4 && (
            <ChannelSelectStep
              onNext={(channel) => {
                setConfig((prev) => ({ ...prev, channel }))
                saveStep('channelSelect', true, 5)
              }}
              onSkip={() => saveStep('channelSelect', false, 5)}
            />
          )}

          {currentStep === 5 && (
            <ChannelConfigStep
              channel={config.channel || 'telegram'}
              onNext={async (channelConfig) => {
                setConfig((prev) => ({ ...prev, channelConfig }))
                await saveConfig('channel', config.channel || 'telegram', channelConfig)
                await saveStep('channelConfig', true, 6)
              }}
              onSkip={() => saveStep('channelConfig', false, 6)}
            />
          )}

          {currentStep === 6 && (
            <SystemPromptStep
              onNext={async (prompt) => {
                setConfig((prev) => ({ ...prev, systemPrompt: prompt }))
                await saveConfig('system_prompt', 'default', prompt)
                await saveStep('systemPrompt', true, 7)
              }}
              onSkip={() => saveStep('systemPrompt', false, 7)}
            />
          )}

          {currentStep === 7 && (
            <TestStep
              onNext={() => {
                saveStep('tested', true, 8)
              }}
            />
          )}

          {currentStep === 8 && <CompleteStep config={config} />}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/app/\(onboarding\)/
git commit -m "feat(onboarding): add wizard page with all steps"
```

---

## Task 12: Dashboard Lock Component

**Files:**
- Create: `saas-platform/src/components/DashboardLock.tsx`
- Modify: `saas-platform/src/app/(dashboard)/layout.tsx`

**Step 1: Create DashboardLock component**

```typescript
// saas-platform/src/components/DashboardLock.tsx
'use client'

import { useRouter } from 'next/navigation'

interface DashboardLockProps {
  show: boolean
}

export function DashboardLock({ show }: DashboardLockProps) {
  const router = useRouter()

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-lg p-8 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2">Setup Incomplete</h2>
        <p className="text-muted-foreground mb-6">
          Complete the setup to unlock all OpenClaw features
        </p>
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue Setup
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Update dashboard layout**

```typescript
// saas-platform/src/app/(dashboard)/layout.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DashboardLock } from '@/components/DashboardLock'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/channels', label: 'Channels', icon: '💬' },
  { href: '/sessions', label: 'Sessions', icon: '📝' },
  { href: '/models', label: 'Models', icon: '🤖' },
  { href: '/tools', label: 'Tools', icon: '🔧' },
  { href: '/agent', label: 'Agent', icon: '🧠' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetch('/api/onboarding/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOnboardingComplete(data.status?.completed ?? false)
        } else {
          router.push('/login')
        }
      })
      .catch(() => {
        router.push('/login')
      })
  }, [router])

  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">🦞 OpenClaw</h1>
        </div>
        <nav className="p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 ${
                pathname === item.href
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>

      {/* Lock overlay */}
      <DashboardLock show={!onboardingComplete} />
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add saas-platform/src/components/DashboardLock.tsx saas-platform/src/app/\(dashboard\)/layout.tsx
git commit -m "feat(onboarding): add dashboard lock overlay"
```

---

## Task 13: Update Auth Flow

**Files:**
- Modify: `saas-platform/src/lib/auth.ts`
- Modify: `saas-platform/src/app/(auth)/register/page.tsx`

**Step 1: Add default onboarding status to registration**

In `saas-platform/src/lib/auth.ts`, update the tenant creation:

```typescript
// In register function, update tenant creation
const [tenant] = await db.insert(tenants).values({
  userId,
  agentId: tenantId,
  displayName: email.split('@')[0],
  onboardingStatus: {
    completed: false,
    currentStep: 1,
    steps: {
      welcome: false,
      apiKey: false,
      model: false,
      channelSelect: false,
      channelConfig: false,
      systemPrompt: false,
      tested: false,
    },
  },
}).returning()
```

**Step 2: Redirect to onboarding after register**

In `saas-platform/src/app/(auth)/register/page.tsx`, update the redirect:

```typescript
// Change router.push('/') to:
router.push('/onboarding')
```

**Step 3: Commit**

```bash
git add saas-platform/src/lib/auth.ts saas-platform/src/app/\(auth\)/register/page.tsx
git commit -m "feat(onboarding): redirect new users to onboarding wizard"
```

---

## Task 14: Install Dependencies

**Step 1: Add clsx and tailwind-merge**

Run: `cd saas-platform && pnpm add clsx tailwind-merge`

**Step 2: Commit**

```bash
git add saas-platform/package.json
git commit -m "chore: add clsx and tailwind-merge dependencies"
```

---

## Summary

After completing all tasks, the onboarding wizard will:

1. **8-step wizard** with stepper navigation
2. **API key validation** for Anthropic/OpenAI
3. **Channel validation** for Telegram/Discord/Slack/WhatsApp
4. **Lazy agent initialization** on first test message
5. **Dashboard locking** until setup is complete
6. **Skip functionality** with persistent state
7. **Configuration persistence** to database

Files created/modified: ~25 files
Estimated commits: 14
