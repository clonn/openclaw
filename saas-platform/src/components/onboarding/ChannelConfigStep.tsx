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
