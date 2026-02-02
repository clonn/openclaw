# OpenClaw SaaS Multi-Tenant Platform Design

**日期**: 2026-02-02
**狀態**: Draft
**目標**: 將 OpenClaw 包裝為 SaaS 平台，支援多租戶、PostgreSQL 儲存、用戶設定介面

---

## 1. 設計目標與約束

### 目標
- 提供 SaaS 多租戶服務，每個用戶獨立隔離
- 配置與 Session 資料儲存於 PostgreSQL
- 每個用戶有獨立的設定介面
- 支援訂閱制 + 超額用量計費

### 約束
- **不修改 OpenClaw 核心程式碼**：OpenClaw 作為黑盒引擎使用
- **與 OpenClaw 更新解耦**：上游更新不影響平台運作
- **使用原生機制**：透過 Agent-per-tenant 實現租戶隔離

---

## 2. 整體架構

```
┌─────────────────────────────────────────────────────────────────┐
│                         用戶瀏覽器                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 應用 (Vercel)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   前端 UI    │  │  API Routes  │  │  Server Actions      │  │
│  │  (React)     │  │  /api/*      │  │  (配置寫入)          │  │
│  └──────────────┘  └──────┬───────┘  └──────────┬───────────┘  │
└───────────────────────────┼─────────────────────┼───────────────┘
                            │                     │
              ┌─────────────┴─────────────┐       │ SSH/CLI
              ▼                           ▼       ▼
┌──────────────────────┐    ┌─────────────────────────────────────┐
│     PostgreSQL       │    │         OpenClaw 主機               │
│  ┌────────────────┐  │    │  ┌─────────────┐  ┌──────────────┐  │
│  │ users          │  │    │  │  Gateway    │  │ Sync Service │  │
│  │ subscriptions  │  │◄───│  │  (HTTP API) │  │ (File Watch) │  │
│  │ usage_logs     │  │    │  └─────────────┘  └──────────────┘  │
│  │ sessions       │  │    │  ~/.openclaw/agents/{tenant}/*     │
│  │ configurations │  │    └─────────────────────────────────────┘
│  └────────────────┘  │
└──────────────────────┘
```

### 核心原則
- OpenClaw 完全不修改，作為黑盒引擎使用
- 所有 SaaS 邏輯在平台層處理
- 資料雙向流動：寫入走 CLI，讀取走 DB

### 資料流向
- **寫入配置** → 平台透過 CLI 操作 → OpenClaw 檔案
- **讀取資料** → Sync Service 監聽檔案 → 同步到 PostgreSQL → 平台從 DB 查詢

---

## 3. PostgreSQL Schema 設計

### 3.1 用戶與認證

```sql
-- 用戶與認證
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 租戶（1 user = 1 tenant，未來可擴展為組織）
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_id      VARCHAR(100) UNIQUE NOT NULL,  -- 對應 OpenClaw agent 目錄名
  display_name  VARCHAR(255),
  status        VARCHAR(20) DEFAULT 'active',  -- active, suspended, deleted
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 訂閱與計費

```sql
-- 訂閱方案
CREATE TABLE plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(100) NOT NULL,      -- free, pro, enterprise
  price_monthly     DECIMAL(10,2),
  msg_limit         INT,                        -- 每月訊息上限，NULL = 無限
  channel_limit     INT,                        -- 可連接的 channel 數
  features          JSONB                       -- 額外功能開關
);

-- 用戶訂閱
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  plan_id           UUID REFERENCES plans(id),
  status            VARCHAR(20) DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 用量追蹤（超額計費用）
CREATE TABLE usage_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  period        DATE NOT NULL,                 -- 計費週期（月份）
  message_count INT DEFAULT 0,
  token_count   BIGINT DEFAULT 0,
  UNIQUE(tenant_id, period)
);
```

### 3.3 配置與 Session

```sql
-- 租戶配置（從 OpenClaw 檔案同步而來）
CREATE TABLE tenant_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  config_type   VARCHAR(50) NOT NULL,          -- 'channel', 'model', 'tool', 'agent'
  config_key    VARCHAR(100) NOT NULL,         -- e.g., 'discord', 'telegram', 'gpt-4'
  config_value  JSONB NOT NULL,                -- 實際配置內容
  enabled       BOOLEAN DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  synced_at     TIMESTAMPTZ,                   -- 最後從檔案同步的時間
  UNIQUE(tenant_id, config_type, config_key)
);

-- Session 記錄（從 JSONL 同步）
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    VARCHAR(255) NOT NULL,         -- OpenClaw 的 session ID
  channel       VARCHAR(50),                   -- discord, telegram, etc.
  started_at    TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INT DEFAULT 0,
  metadata      JSONB,                         -- 額外 session 資訊
  UNIQUE(tenant_id, session_id)
);

-- 對話訊息（從 JSONL 同步）
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL,          -- user, assistant, system
  content       TEXT,
  token_count   INT,                           -- 用於計費
  created_at    TIMESTAMPTZ NOT NULL,
  metadata      JSONB,                         -- tool calls, model info, etc.

  CONSTRAINT fk_session FOREIGN KEY (tenant_id, session_id)
    REFERENCES sessions(tenant_id, session_id)
);

-- 對話分析用的彙總表
CREATE TABLE session_stats (
  tenant_id     UUID REFERENCES tenants(id),
  period        DATE NOT NULL,
  channel       VARCHAR(50),
  session_count INT DEFAULT 0,
  message_count INT DEFAULT 0,
  avg_response_time_ms INT,
  PRIMARY KEY (tenant_id, period, channel)
);
```

### 3.4 索引

```sql
CREATE INDEX idx_messages_tenant_session ON messages(tenant_id, session_id, created_at);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id, last_message_at DESC);
```

---

## 4. Sync Service 設計

### 4.1 核心邏輯

```typescript
// sync-service/src/index.ts
import chokidar from 'chokidar'
import { Pool } from 'pg'

const OPENCLAW_BASE = process.env.OPENCLAW_STATE_DIR || '~/.openclaw'
const WATCH_PATTERNS = [
  `${OPENCLAW_BASE}/agents/*/sessions/*.jsonl`,
  `${OPENCLAW_BASE}/agents/*/sessions/sessions.json`,
  `${OPENCLAW_BASE}/openclaw.json`
]

class SyncService {
  private db: Pool
  private watcher: chokidar.FSWatcher
  private recentPlatformWrites = new Set<string>()

  async start() {
    this.watcher = chokidar.watch(WATCH_PATTERNS, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    this.watcher
      .on('add', (path) => this.handleChange(path))
      .on('change', (path) => this.handleChange(path))
  }

  private async handleChange(filePath: string) {
    const fileHash = await this.hashFile(filePath)
    if (this.recentPlatformWrites.has(fileHash)) {
      this.recentPlatformWrites.delete(fileHash)
      return
    }

    const tenantId = this.extractTenantId(filePath)
    if (!tenantId) return

    if (filePath.endsWith('.jsonl')) {
      await this.syncSessionMessages(tenantId, filePath)
    } else if (filePath.endsWith('sessions.json')) {
      await this.syncSessionIndex(tenantId, filePath)
    } else if (filePath.endsWith('openclaw.json')) {
      await this.syncConfig(tenantId, filePath)
    }
  }

  private extractTenantId(filePath: string): string | null {
    const match = filePath.match(/agents\/([^/]+)\//)
    return match ? match[1] : null
  }

  markPlatformWrite(fileHash: string) {
    this.recentPlatformWrites.add(fileHash)
    setTimeout(() => this.recentPlatformWrites.delete(fileHash), 5000)
  }
}
```

### 4.2 關鍵機制
- `awaitWriteFinish`: 等待檔案寫入穩定再處理
- `recentPlatformWrites`: 標記平台觸發的寫入，防止同步循環
- 依檔案類型分流處理

---

## 5. Next.js 平台層

### 5.1 專案結構

```
openclaw-saas/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── channels/page.tsx
│   │   │   ├── models/page.tsx
│   │   │   ├── tools/page.tsx
│   │   │   ├── agent/page.tsx
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── billing/page.tsx
│   │   └── api/
│   │       ├── auth/[...]/route.ts
│   │       ├── config/route.ts
│   │       ├── sessions/route.ts
│   │       └── usage/route.ts
│   ├── lib/
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   ├── openclaw-cli.ts
│   │   └── openclaw-api.ts
│   └── components/
│       ├── ui/
│       └── dashboard/
├── sync-service/
│   ├── src/
│   └── package.json
└── docker-compose.yml
```

### 5.2 技術選擇
- UI: shadcn/ui + Tailwind CSS
- ORM: Drizzle 或 Prisma
- 驗證: Zod
- 狀態: React Query (TanStack Query)

---

## 6. OpenClaw 整合層

### 6.1 CLI 封裝

```typescript
// src/lib/openclaw-cli.ts
export class OpenClawCLI {
  constructor(
    private tenantId: string,
    private syncService?: SyncService
  ) {}

  private get agentDir() {
    return `${STATE_DIR}/agents/${this.tenantId}`
  }

  private async exec(command: string): Promise<string> {
    const fullCommand = `${OPENCLAW_BIN} ${command} --agent-dir "${this.agentDir}"`
    const { stdout } = await execAsync(fullCommand, { timeout: 30000 })
    return stdout
  }

  async setChannel(channel: string, config: Record<string, any>) {
    const configHash = this.predictConfigHash(channel, config)
    this.syncService?.markPlatformWrite(configHash)

    for (const [key, value] of Object.entries(config)) {
      await this.exec(`config set channels.${channel}.${key} "${value}"`)
    }
  }

  async setModel(alias: string, provider: string, model: string) {
    await this.exec(`config set models.${alias}.provider "${provider}"`)
    await this.exec(`config set models.${alias}.model "${model}"`)
  }

  async setSystemPrompt(prompt: string) {
    const tempFile = `/tmp/prompt-${this.tenantId}.txt`
    await fs.writeFile(tempFile, prompt)
    await this.exec(`config set agents.default.systemPrompt --file "${tempFile}"`)
    await fs.unlink(tempFile)
  }
}
```

### 6.2 Gateway API 封裝

```typescript
// src/lib/openclaw-api.ts
export class OpenClawAPI {
  constructor(
    private gatewayUrl: string,
    private tenantId: string
  ) {}

  async sendMessage(sessionId: string, message: string) {
    const res = await fetch(`${this.gatewayUrl}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.tenantId,
        sessionId,
        message
      })
    })
    return res.json()
  }
}
```

---

## 7. 認證系統

```typescript
// src/lib/auth.ts
export interface AuthProvider {
  authenticate(credentials: any): Promise<AuthResult>
  register?(data: any): Promise<AuthResult>
}

export class EmailAuthProvider implements AuthProvider {
  async register(data: { email: string; password: string }): Promise<AuthResult> {
    const { email, password } = data
    const passwordHash = await bcrypt.hash(password, 12)
    const userId = crypto.randomUUID()
    const tenantId = `tenant-${userId.slice(0, 8)}`

    await db.query('BEGIN')
    try {
      await db.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [userId, email, passwordHash]
      )
      await db.query(
        'INSERT INTO tenants (id, user_id, agent_id) VALUES ($1, $2, $3)',
        [crypto.randomUUID(), userId, tenantId]
      )
      await this.initializeTenant(tenantId)
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    return { success: true, user: { id: userId, email, tenantId } }
  }
}
```

### 擴展性設計
- `AuthProvider` 介面可新增 OAuth providers
- 用戶註冊時自動建立 tenant 和初始化 OpenClaw agent
- JWT 包含 `tenantId`，每次請求都能識別租戶

---

## 8. Dashboard UI

### 頁面規劃

| 頁面 | 功能 |
|------|------|
| `/` | 總覽：今日訊息數、活躍 session、用量圖表 |
| `/channels` | 連接 Telegram/Discord/Slack 等 |
| `/models` | 選擇 AI 模型、設定 API Key |
| `/tools` | 啟用/停用工具權限 |
| `/agent` | System prompt、名稱、回應風格 |
| `/sessions` | 歷史對話列表 |
| `/analytics` | 訊息統計、Channel 分佈 |
| `/billing` | 方案、用量、帳單 |

---

## 9. 部署架構

### 9.1 Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: openclaw_saas
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  openclaw:
    image: node:22-alpine
    command: openclaw gateway run --bind 0.0.0.0 --port 18789
    environment:
      OPENCLAW_STATE_DIR: /data/openclaw
    volumes:
      - openclaw_data:/data/openclaw
    ports:
      - "18789:18789"

  sync-service:
    build: ./sync-service
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/openclaw_saas
      OPENCLAW_STATE_DIR: /data/openclaw
    volumes:
      - openclaw_data:/data/openclaw:ro

  platform:
    build: .
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/openclaw_saas
      OPENCLAW_STATE_DIR: /data/openclaw
      OPENCLAW_GATEWAY_URL: http://openclaw:18789
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - openclaw_data:/data/openclaw
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  openclaw_data:
```

### 9.2 生產建議架構

```
┌─────────────┐     ┌──────────────────────────────────────┐
│   Vercel    │     │         VPS (4GB+ RAM)               │
│  (Next.js)  │────▶│  ┌──────────┐  ┌─────────────────┐  │
└─────────────┘     │  │ OpenClaw │  │  Sync Service   │  │
       │            │  │ Gateway  │  │                 │  │
       │            │  └──────────┘  └─────────────────┘  │
       ▼            │       │              │              │
┌─────────────┐     │       └──────┬───────┘              │
│  Supabase   │◀────│              ▼                      │
│ (PostgreSQL)│     │    /data/openclaw/agents/*          │
└─────────────┘     └──────────────────────────────────────┘
```

---

## 10. 實作階段

### Phase 1: 基礎建設（1-2 週）
- PostgreSQL schema 建立
- Next.js 專案初始化
- 自建認證系統
- 租戶建立流程
- 基本 Dashboard layout

### Phase 2: OpenClaw 整合（1-2 週）
- OpenClaw CLI 封裝層
- Sync Service 實作
- 配置讀寫 API
- Channel 設定頁面

### Phase 3: 核心功能（2-3 週）
- Model/Tool/Agent 設定頁面
- Session 歷史頁面
- 對話詳情查看

### Phase 4: 計費與分析（1-2 週）
- 方案定義與訂閱管理
- 用量追蹤
- 對話統計圖表
- 帳單頁面

### Phase 5: 上線準備（1 週）
- 部署腳本與 CI/CD
- 監控與告警
- 文件與 onboarding

### 關鍵驗收點
- Phase 1：可註冊、登入、看到 Dashboard
- Phase 2：可設定 Channel 並同步到 DB
- Phase 3：完整設定介面、查看對話歷史
- Phase 4：可選擇方案、追蹤用量
- Phase 5：可正式對外服務

---

## 11. 風險與緩解

| 風險 | 緩解措施 |
|------|----------|
| OpenClaw CLI 介面變更 | 封裝層隔離，版本鎖定 |
| 同步延遲導致資料不一致 | File Watcher 即時同步 + 重試機制 |
| 單一 OpenClaw 實例瓶頸 | 監控負載，必要時升級為 Container-per-tenant |
| 敏感資料外洩 | API Key 不進 log，DB 欄位加密 |
