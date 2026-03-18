import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  getChannel, triggerJob, getChannelJobs, getAuthUrl, disconnectChannel,
  getSchedules, createSchedule, toggleSchedule, deleteSchedule,
  getChannelStats, getChannelYTVideos,
  getIdeas, createIdea, updateIdea, deleteIdea, generateIdeas,
  type Channel, type Job, type Schedule, type ChannelStats, type YTVideo,
  type VideoModel, type VideoIdea,
} from '../api/client'
import JobStatus from '../components/JobStatus'

const CRON_PRESETS = [
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every day at 6pm', value: '0 18 * * *' },
  { label: 'Twice a day (9am & 6pm)', value: '0 9,18 * * *' },
  { label: 'Every Monday 9am', value: '0 9 * * 1' },
]

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [stats, setStats] = useState<ChannelStats | null>(null)
  const [videos, setVideos] = useState<YTVideo[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [ideas, setIdeas] = useState<VideoIdea[]>([])
  const [triggering, setTriggering] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [cronInput, setCronInput] = useState(CRON_PRESETS[0].value)
  const [tab, setTab] = useState<'ideas' | 'jobs' | 'videos' | 'schedule'>('ideas')
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedModel, setSelectedModel] = useState<VideoModel>('anthropic')
  const [pendingIdeaId, setPendingIdeaId] = useState<string | undefined>(undefined)
  // Idea form
  const [newIdeaTitle, setNewIdeaTitle] = useState('')
  const [newIdeaNotes, setNewIdeaNotes] = useState('')
  const [editingIdea, setEditingIdea] = useState<VideoIdea | null>(null)
  const [generatingIdeas, setGeneratingIdeas] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [ch, js, sc, idList] = await Promise.all([
      getChannel(id),
      getChannelJobs(id),
      getSchedules(id),
      getIdeas(id),
    ])
    setChannel(ch)
    setJobs(js)
    setSchedules(sc)
    setIdeas(idList)
  }, [id])

  const loadStats = useCallback(async () => {
    if (!id) return
    try {
      const s = await getChannelStats(id)
      setStats(s)
    } catch {
      setStats(null)
    }
  }, [id])

  const loadVideos = useCallback(async () => {
    if (!id) return
    try {
      const v = await getChannelYTVideos(id)
      setVideos(v)
    } catch {
      setVideos([])
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (channel?.connected) {
      loadStats()
    }
  }, [channel?.connected, loadStats])

  useEffect(() => {
    if (tab === 'videos' && channel?.connected) {
      loadVideos()
    }
  }, [tab, channel?.connected, loadVideos])

  // Poll active job until it reaches a terminal or user-action state
  const TERMINAL = new Set(['preview', 'scheduled', 'done', 'failed', 'rejected'])
  useEffect(() => {
    if (!activeJobId) return
    const iv = setInterval(async () => {
      const job = jobs.find(j => j.id === activeJobId)
      if (job && TERMINAL.has(job.status)) {
        setActiveJobId(null)
        clearInterval(iv)
        return
      }
      await load()
    }, 3000)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, load])

  const handleTriggerConfirmed = async () => {
    if (!id) return
    setShowConfirm(false)
    setTriggering(true)
    try {
      const job = await triggerJob(id, selectedModel, pendingIdeaId)
      setPendingIdeaId(undefined)
      setActiveJobId(job.id)
      setTab('jobs')
      await load()
    } finally {
      setTriggering(false)
    }
  }

  const handleGenerateFromIdea = (idea: VideoIdea) => {
    setPendingIdeaId(idea.id)
    setShowConfirm(true)
  }

  const handleAddIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !newIdeaTitle.trim()) return
    await createIdea(id, { title: newIdeaTitle.trim(), notes: newIdeaNotes.trim() || undefined })
    setNewIdeaTitle('')
    setNewIdeaNotes('')
    load()
  }

  const handleSaveEdit = async () => {
    if (!editingIdea) return
    await updateIdea(editingIdea.id, { title: editingIdea.title, notes: editingIdea.notes ?? undefined })
    setEditingIdea(null)
    load()
  }

  const handleGenerateIdeas = async () => {
    if (!id) return
    setGeneratingIdeas(true)
    try {
      await generateIdeas(id, 10)
      load()
    } finally {
      setGeneratingIdeas(false)
    }
  }

  const handleConnect = async () => {
    if (!id) return
    const { auth_url } = await getAuthUrl(id)
    window.location.href = auth_url
  }

  const handleDisconnect = async () => {
    if (!id || !confirm('Disconnect this YouTube account?')) return
    await disconnectChannel(id)
    setStats(null)
    setVideos([])
    load()
  }

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    await createSchedule(id, cronInput)
    load()
  }

  if (!channel) return <div className="text-gray-400">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold">Generate video</h2>
            <div className="text-sm text-gray-300 space-y-1">
              <p className="text-gray-400">Channel: <span className="text-white font-medium">{channel.name}</span></p>
              {pendingIdeaId && ideas.find(i => i.id === pendingIdeaId) && (
                <div className="bg-gray-700 rounded-lg px-3 py-2 mt-1">
                  <p className="text-xs text-gray-400">Using idea:</p>
                  <p className="text-sm text-white font-medium">{ideas.find(i => i.id === pendingIdeaId)?.title}</p>
                  {ideas.find(i => i.id === pendingIdeaId)?.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">{ideas.find(i => i.id === pendingIdeaId)?.notes}</p>
                  )}
                </div>
              )}
              {!pendingIdeaId && (
                <p className="text-xs text-gray-500">
                  {ideas.filter(i => i.status === 'pending').length > 0
                    ? `Will auto-use next pending idea`
                    : 'No pending ideas — Claude will generate a concept'}
                </p>
              )}
            </div>

            {/* Model selector */}
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 font-medium">Video model</p>
              <div className="grid grid-cols-2 gap-2">
                {(['anthropic', 'kling', 'sora', 'veo'] as VideoModel[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setSelectedModel(m)}
                    className={`text-xs py-2 px-3 rounded-lg border transition capitalize ${
                      selectedModel === m
                        ? 'border-red-500 bg-red-900/30 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {m === 'anthropic' ? 'Anthropic (default)' : m === 'veo' ? 'Veo 2' : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleTriggerConfirmed}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-medium py-2 rounded-lg transition"
              >
                Generate & Preview
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-sm py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          <p className="text-gray-400 mt-1">{channel.genre}</p>
          {channel.style_notes && (
            <p className="text-sm text-gray-500 mt-1">{channel.style_notes}</p>
          )}
          {channel.youtube_channel_id && (
            <p className="text-xs text-gray-600 mt-1 font-mono">
              YT: {channel.youtube_channel_id}
            </p>
          )}
        </div>

        <div className="flex gap-3 flex-wrap justify-end">
          {channel.connected ? (
            <>
              <button
                onClick={() => { setPendingIdeaId(undefined); setShowConfirm(true) }}
                disabled={triggering}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {triggering ? '⏳ Starting...' : '▶ Generate & Upload'}
              </button>
              <button
                onClick={handleDisconnect}
                className="bg-gray-700 hover:bg-gray-600 text-sm px-4 py-2 rounded-lg transition"
              >
                Disconnect YouTube
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              Connect YouTube
            </button>
          )}
        </div>
      </div>

      {/* Stats bar (only when connected) */}
      {channel.connected && stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Subscribers', value: fmt(stats.subscriber_count) },
            { label: 'Total views', value: fmt(stats.view_count) },
            { label: 'Videos', value: fmt(stats.video_count) },
          ].map(s => (
            <div
              key={s.label}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center"
            >
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {(['ideas', 'jobs', ...(channel.connected ? ['videos'] : []), 'schedule'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap capitalize transition border-b-2 -mb-px ${
              tab === t
                ? 'border-red-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'ideas'
              ? `Ideas (${ideas.filter(i => i.status === 'pending').length})`
              : t === 'jobs'
              ? `Jobs (${jobs.length})`
              : t === 'videos'
              ? 'Videos'
              : 'Schedule'}
          </button>
        ))}
      </div>

      {/* Ideas tab */}
      {tab === 'ideas' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex gap-2 justify-between items-center flex-wrap">
            <p className="text-sm text-gray-400">
              {ideas.filter(i => i.status === 'pending').length} pending ·{' '}
              {ideas.filter(i => i.status === 'done').length} done
            </p>
            <button
              onClick={handleGenerateIdeas}
              disabled={generatingIdeas}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
            >
              {generatingIdeas ? '⏳ Generating...' : '✨ Generate 10 ideas with AI'}
            </button>
          </div>

          {/* Add idea form */}
          <form onSubmit={handleAddIdea} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-300">Add idea manually</h3>
            <input
              value={newIdeaTitle}
              onChange={e => setNewIdeaTitle(e.target.value)}
              placeholder="Video title / idea"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <input
                value={newIdeaNotes}
                onChange={e => setNewIdeaNotes(e.target.value)}
                placeholder="Notes / talking points (optional)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={!newIdeaTitle.trim()}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
              >
                Add
              </button>
            </div>
          </form>

          {/* Ideas table */}
          {ideas.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
              No ideas yet. Add one manually or click "Generate with AI".
            </div>
          ) : (
            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Notes</th>
                    <th className="text-left px-4 py-3 w-24">Status</th>
                    <th className="text-right px-4 py-3 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {ideas.map(idea => (
                    <tr key={idea.id} className="bg-gray-800/40 hover:bg-gray-800 transition">
                      <td className="px-4 py-3">
                        {editingIdea?.id === idea.id ? (
                          <input
                            value={editingIdea.title}
                            onChange={e => setEditingIdea({ ...editingIdea, title: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-red-500"
                          />
                        ) : (
                          <span className={idea.status === 'done' ? 'line-through text-gray-500' : ''}>{idea.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs max-w-xs truncate">
                        {editingIdea?.id === idea.id ? (
                          <input
                            value={editingIdea.notes ?? ''}
                            onChange={e => setEditingIdea({ ...editingIdea, notes: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                        ) : (
                          idea.notes ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          idea.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                          idea.status === 'done' ? 'bg-green-900 text-green-400' :
                          idea.status === 'in_progress' ? 'bg-blue-900 text-blue-300' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {idea.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {editingIdea?.id === idea.id ? (
                            <>
                              <button onClick={handleSaveEdit} className="text-xs text-green-400 hover:text-green-300">Save</button>
                              <button onClick={() => setEditingIdea(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                            </>
                          ) : (
                            <>
                              {idea.status === 'pending' && (
                                <button
                                  onClick={() => handleGenerateFromIdea(idea)}
                                  className="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded transition"
                                >
                                  ▶ Generate
                                </button>
                              )}
                              <button onClick={() => setEditingIdea(idea)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                              <button
                                onClick={() => deleteIdea(idea.id).then(load)}
                                className="text-xs text-gray-600 hover:text-red-400"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
              No jobs yet. Go to the Ideas tab and click ▶ Generate on an idea.
            </div>
          ) : (
            jobs.map(job => <JobStatus key={job.id} job={job} onUpdate={load} />)
          )}
        </div>
      )}

      {/* Videos tab */}
      {tab === 'videos' && (
        <div>
          {videos.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
              No videos found on this channel yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map(v => (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-500 transition group"
                >
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt={v.title}
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-gray-700 flex items-center justify-center text-gray-500 text-xs">
                      No thumbnail
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs text-gray-200 line-clamp-2 group-hover:text-white transition">
                      {v.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(v.published_at).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule tab */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddSchedule}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3"
          >
            <h3 className="font-medium">Add Schedule</h3>
            <div className="flex gap-2 flex-wrap">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setCronInput(p.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition ${
                    cronInput === p.value
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                value={cronInput}
                onChange={e => setCronInput(e.target.value)}
                placeholder="cron: * * * * *"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-lg transition"
              >
                Add
              </button>
            </div>
          </form>

          {schedules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-700 rounded-xl">
              No schedules yet.
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => (
                <div
                  key={s.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <code className="text-sm text-gray-200">{s.cron_expression}</code>
                    {s.last_run && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Last run: {new Date(s.last_run).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => toggleSchedule(s.id).then(load)}
                      className={`text-xs px-3 py-1 rounded-full transition ${
                        s.is_active
                          ? 'bg-green-900 text-green-400 hover:bg-green-800'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {s.is_active ? '● Active' : '○ Paused'}
                    </button>
                    <button
                      onClick={() => deleteSchedule(s.id).then(load)}
                      className="text-xs text-gray-600 hover:text-red-400 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
