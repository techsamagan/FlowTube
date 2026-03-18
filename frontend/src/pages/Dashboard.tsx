import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChannels, type Channel } from '../api/client'

export default function Dashboard() {
  const [channels, setChannels] = useState<Channel[]>([])

  useEffect(() => {
    getChannels().then(setChannels).catch(() => {})
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          AI-powered YouTube Shorts generation for all your channels.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total Channels" value={channels.length} />
        <Stat
          label="Connected"
          value={channels.filter(c => c.connected).length}
          color="text-green-400"
        />
        <Stat
          label="Not Connected"
          value={channels.filter(c => !c.connected).length}
          color="text-yellow-400"
        />
      </div>

      {/* Channel cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your Channels</h2>
          <Link
            to="/channels"
            className="text-sm text-red-400 hover:text-red-300 transition"
          >
            Manage →
          </Link>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-16 text-gray-500 border border-dashed border-gray-700 rounded-xl">
            <p className="text-xl mb-2">No channels yet</p>
            <Link to="/channels" className="text-red-400 hover:text-red-300">
              + Add your first channel
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {channels.map(ch => (
              <Link
                key={ch.id}
                to={`/channels/${ch.id}`}
                className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl p-4 transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{ch.name}</p>
                    <p className="text-sm text-gray-400 mt-1">{ch.genre}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      ch.connected
                        ? 'bg-green-900 text-green-400'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {ch.connected ? '● Connected' : '○ Not connected'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  color = 'text-white',
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}
