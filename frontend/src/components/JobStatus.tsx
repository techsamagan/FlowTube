import { useState } from 'react'
import { approveJob, scheduleJob, rejectJob, type Job } from '../api/client'

const STEP_LABELS: Record<string, string> = {
  generate_video_concept: '🧠 Generating concept...',
  generate_images: '🎨 Creating images...',
  generate_voiceover: '🎤 Recording voiceover...',
  generate_music: '🎵 Composing music...',
  generate_video_with_model: '🎬 Generating video...',
  assemble_video: '🎬 Assembling video...',
  upload_to_youtube: '📤 Uploading to YouTube...',
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-600',
  running: 'bg-blue-600',
  preview: 'bg-yellow-600',
  scheduled: 'bg-purple-600',
  uploading: 'bg-blue-600',
  done: 'bg-green-600',
  failed: 'bg-red-600',
  rejected: 'bg-gray-700',
}

const MODEL_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  kling: 'Kling AI',
  sora: 'Sora',
  veo: 'Veo 2',
}

const BACKEND = 'http://localhost:8000'

export default function JobStatus({ job, onUpdate }: { job: Job; onUpdate?: () => void }) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [busy, setBusy] = useState(false)

  const barColor = STATUS_COLORS[job.status] ?? 'bg-gray-600'
  const videoUrl = job.video_path ? `${BACKEND}/storage/${job.video_path}` : null

  const handle = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onUpdate?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${barColor}`}>
            {job.status}
          </span>
          {job.model && (
            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
              {MODEL_LABELS[job.model] ?? job.model}
            </span>
          )}
          {job.current_step && (
            <span className="text-sm text-gray-300">
              {STEP_LABELS[job.current_step] ?? job.current_step}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{new Date(job.created_at).toLocaleString()}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${barColor}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {/* Video preview */}
      {videoUrl && job.status === 'preview' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-yellow-400">📽 Preview ready — review and approve</p>
          <video
            src={videoUrl}
            controls
            className="w-full max-w-xs mx-auto rounded-lg border border-gray-600"
            style={{ maxHeight: 420 }}
          />

          {/* Action buttons */}
          {!showSchedule ? (
            <div className="flex gap-2 flex-wrap">
              <button
                disabled={busy}
                onClick={() => handle(() => approveJob(job.id))}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition"
              >
                ✅ Upload Now
              </button>
              <button
                disabled={busy}
                onClick={() => setShowSchedule(true)}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition"
              >
                🕐 Schedule
              </button>
              <button
                disabled={busy}
                onClick={() => handle(() => rejectJob(job.id))}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm py-2 px-3 rounded-lg transition"
              >
                ✗ Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Pick date & time for upload:</p>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                />
                <button
                  disabled={!scheduleDate || busy}
                  onClick={() =>
                    handle(() => scheduleJob(job.id, new Date(scheduleDate).toISOString()))
                  }
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowSchedule(false)}
                  className="text-gray-500 hover:text-gray-300 text-sm px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduled info */}
      {job.status === 'scheduled' && job.scheduled_upload_at && (
        <p className="text-sm text-purple-400">
          🕐 Scheduled for {new Date(job.scheduled_upload_at).toLocaleString()}
        </p>
      )}

      {/* Error */}
      {job.error_message && (
        <p className="text-sm text-red-400 bg-red-900/20 rounded p-2">⚠️ {job.error_message}</p>
      )}

      {/* Done */}
      {job.status === 'done' && (
        <p className="text-sm text-green-400">✅ Uploaded to YouTube!</p>
      )}

      {/* Rejected */}
      {job.status === 'rejected' && (
        <p className="text-sm text-gray-500">✗ Video rejected</p>
      )}
    </div>
  )
}
