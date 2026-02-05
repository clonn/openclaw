# Onboarding Wizard Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a guided onboarding wizard that walks new users through API Key setup, channel configuration, and testing before unlocking the Dashboard.

**Architecture:** Single-page stepper wizard with 8 steps, lazy agent initialization on first test message, dashboard locked until onboarding complete.

**Tech Stack:** Next.js 14 App Router, React Server Components, Tailwind CSS, OpenClaw CLI

---

## User Flow Overview

```
Register/Login
     ↓
Check onboardingStatus
     ↓
┌─────────────────┐     ┌──────────────────┐
│ Not Complete    │────→│ /onboarding      │
└─────────────────┘     │ (Wizard)         │
                        └────────┬─────────┘
                                 ↓
                        Complete all steps
                                 ↓
                        ┌──────────────────┐
                        │ Dashboard        │
                        │ (Unlocked)       │
                        └──────────────────┘
```

## Wizard Structure

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ●           │
│  1     2     3     4     5     6     7     8            │
│  Welcome│API Key│Model│Channel│Config│Prompt│Test│Done  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              [ Current Step Content Area ]              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    [Skip]  [Next →]                     │
└─────────────────────────────────────────────────────────┘
```

### Step Details

#### Step 1 - Welcome
- OpenClaw Logo + title "Welcome to OpenClaw"
- 3-4 feature highlight icon cards
- "Start Setup" button

#### Step 2 - API Key
- Provider selection: Anthropic / OpenAI (tab switch)
- API Key input field (password mask + show toggle)
- "Validate" button: call API to confirm key validity
- Expandable "How to get an API Key?" tutorial

#### Step 3 - Model Selection
- Model list based on selected provider
- Radio selection with model characteristics (speed/intelligence/cost)
- Recommended model pre-selected

#### Step 4 - Channel Selection
- 4 channel cards: Telegram / Discord / Slack / WhatsApp
- Single select, click to select with checkmark
- "Add more channels later in Dashboard" hint

#### Step 5 - Channel Config
- Dynamic form based on Step 4 selection
- Telegram: Bot Token input + @BotFather tutorial
- Discord: Bot Token + Application ID + tutorial link
- Real-time format validation

#### Step 6 - System Prompt
- Textarea for custom prompt
- Default template: "You are a friendly AI assistant..."
- "Use Default" button for quick skip

#### Step 7 - Test
- Embedded WebChat component
- "Send a message to test if AI works" prompt
- Green checkmark on successful response

#### Step 8 - Complete
- 🎉 Success animation
- "Go to Dashboard" button
- Setup summary display

## Dashboard Lock State

When onboarding is incomplete:

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (visible but greyed out)                       │
│  ┌──────┐ ┌───────────────────────────────────────────┐ │
│  │ Nav  │ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│  │ ...  │ │ ░░░  ┌─────────────────────────┐  ░░░░░ │ │
│  │      │ │ ░░░  │  ⚠️ Setup Incomplete     │  ░░░░░ │ │
│  │      │ │ ░░░  │                         │  ░░░░░ │ │
│  │      │ │ ░░░  │  Complete setup to use  │  ░░░░░ │ │
│  │      │ │ ░░░  │  all OpenClaw features  │  ░░░░░ │ │
│  │      │ │ ░░░  │                         │  ░░░░░ │ │
│  │      │ │ ░░░  │  [ Continue Setup ]     │  ░░░░░ │ │
│  │      │ │ ░░░  └─────────────────────────┘  ░░░░░ │ │
│  └──────┘ └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Check `tenants.onboardingStatus` on login
- Incomplete → redirect to `/onboarding` or show lock overlay
- Sidebar visible but clicks have no effect
- "Continue Setup" button navigates to last incomplete step

## Database Changes

```typescript
// Add to tenants table
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
}>()
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding/status` | Get current onboarding status |
| PUT | `/api/onboarding/step` | Update step completion status |
| POST | `/api/onboarding/validate-key` | Validate API Key |
| POST | `/api/onboarding/validate-channel` | Validate Channel Token |
| POST | `/api/onboarding/test-message` | Send test message (triggers agent init) |
| POST | `/api/onboarding/complete` | Mark complete, unlock Dashboard |

## Lazy Agent Initialization

Agent is only created when user sends first test message (Step 7):

```
User Input → POST /api/onboarding/test-message
          → Check if Agent exists
          → If not: execute openclaw init --agent {tenant-id}
          → Set API Key, Model, Channel via CLI
          → Call OpenClaw to process message
          → Return AI response
          → Update onboardingStatus.steps.tested = true
```

## File Structure

```
saas-platform/src/
├── app/
│   ├── (onboarding)/
│   │   └── onboarding/
│   │       └── page.tsx          # Wizard main page
│   └── api/
│       └── onboarding/
│           ├── status/route.ts
│           ├── step/route.ts
│           ├── validate-key/route.ts
│           ├── validate-channel/route.ts
│           ├── test-message/route.ts
│           └── complete/route.ts
├── components/
│   ├── onboarding/
│   │   ├── Stepper.tsx           # Step progress bar
│   │   ├── WelcomeStep.tsx
│   │   ├── ApiKeyStep.tsx
│   │   ├── ModelStep.tsx
│   │   ├── ChannelSelectStep.tsx
│   │   ├── ChannelConfigStep.tsx
│   │   ├── SystemPromptStep.tsx
│   │   ├── TestStep.tsx          # Contains WebChat
│   │   └── CompleteStep.tsx
│   ├── WebChat.tsx               # Reusable chat component
│   └── DashboardLock.tsx         # Lock overlay component
└── lib/
    └── onboarding.ts             # Onboarding logic
```

## Component Responsibilities

- **Stepper.tsx**: Display steps 1-8 with current/complete/pending states
- **WebChat.tsx**: Simple chat UI, send/receive messages, reusable in Test step and Dashboard
- **DashboardLock.tsx**: Overlay + Modal, wraps entire Dashboard layout

## Route Protection

- Extend `middleware.ts`: check onboarding completion status
- Incomplete + accessing Dashboard → add `x-onboarding-required: true` header
- Layout reads header to decide whether to show Lock Overlay

## Multi-tenant Isolation

- One user = One tenant = One agent
- Agent ID derived from tenant ID: `tenant-{userId.slice(0,8)}`
- All configurations stored per-tenant in database
- OpenClaw files stored in `{OPENCLAW_BASE_DIR}/agents/{tenant-id}/`

## Skip Behavior

- Users CAN skip steps in the wizard
- But Dashboard remains LOCKED until required steps complete
- Required steps: API Key + Channel Config + Test
- Optional steps: Welcome, Model (uses default), System Prompt (uses default)

## Success Criteria

1. New user can complete onboarding in under 5 minutes
2. API Key validation provides clear error messages
3. Channel token validation confirms bot is working
4. Test message successfully initializes agent and returns AI response
5. Dashboard unlocks immediately after completing all required steps
