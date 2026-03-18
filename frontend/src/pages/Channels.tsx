import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChannels, createChannel, deleteChannel, type Channel } from '../api/client'

const GENRES = [
  'Motivation & Mindset', 'Finance & Investing', 'Health & Fitness',
  'Technology & AI', 'Gaming Highlights', 'Travel & Adventure',
  'Cooking & Recipes', 'Comedy & Entertainment', 'Educational / Facts',
  'Fashion & Beauty', 'Pets & Animals', 'Sports', 'Music', 'Custom',
]

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', genre: GENRES[0], style_notes: '' })
  const [saving, setSaving] = useState(false)

  const load = () => getChannels().then(setChannels).catch(() => {})

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createChannel(form)
      setShowForm(false)
      setForm({ name: '', genre: GENRES[0], style_notes: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this channel and all its data?')) return
    await deleteChannel(id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Channels</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {showForm ? 'Cancel' : '+ New Channel'}
        </button>
      </div>

      {/* New channel form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-semibold">Create Channel</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Channel Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              placeholder="e.g. Daily Motivation"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Genre</label>
            <select
              value={form.genre}
              onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            >
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Style Notes <span className="text-gray-600">(optional)</span>
            </label>
            <textarea
              value={form.style_notes}
              onChange={e => setForm(f => ({ ...f, style_notes: e.target.value }))}
              placeholder="e.g. Energetic tone, dark cinematic visuals, 20-30 second videos"
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
          >
            {saving ? 'Creating...' : 'Create Channel'}
          </button>
        </form>
      )}

      {/* Channel list */}
      {channels.length === 0 ? (
        <div className="text-center py-16 text-gray-500 border border-dashed border-gray-700 rounded-xl">
          No channels yet. Create your first one!
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => (
            <div
              key={ch.id}
              className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <Link
                  to={`/channels/${ch.id}`}
                  className="font-semibold hover:text-red-400 transition"
                >
                  {ch.name}
                </Link>
                <p className="text-sm text-gray-400 mt-0.5">{ch.genre}</p>
                {ch.style_notes && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                    {ch.style_notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    ch.connected
                      ? 'bg-green-900 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {ch.connected ? '● Connected' : '○ Not connected'}
                </span>
                <Link
                  to={`/channels/${ch.id}`}
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Open →
                </Link>
                <button
                  onClick={() => handleDelete(ch.id)}
                  className="text-sm text-gray-600 hover:text-red-400 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
