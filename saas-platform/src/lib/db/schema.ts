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
