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
