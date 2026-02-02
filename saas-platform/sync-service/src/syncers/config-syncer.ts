import { db } from '../../../src/lib/db'
import { tenantConfigs } from '../../../src/lib/db/schema'
import fs from 'fs/promises'

export async function syncConfig(tenantId: string, filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const config = JSON.parse(content)

    if (config.channels) {
      for (const [key, value] of Object.entries(config.channels)) {
        await upsertConfig(tenantId, 'channel', key, value)
      }
    }

    if (config.models) {
      for (const [key, value] of Object.entries(config.models)) {
        await upsertConfig(tenantId, 'model', key, value)
      }
    }

    if (config.tools) {
      for (const [key, value] of Object.entries(config.tools)) {
        await upsertConfig(tenantId, 'tool', key, value)
      }
    }

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
