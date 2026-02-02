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
