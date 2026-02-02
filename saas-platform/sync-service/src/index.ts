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

const service = new SyncService()
service.start().catch(console.error)

process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await service.stop()
  process.exit(0)
})
