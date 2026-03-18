import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface Channel {
  id: string
  name: string
  youtube_channel_id: string | null
  genre: string
  style_notes: string | null
  connected: boolean
  created_at: string
}

export type VideoModel = 'anthropic' | 'kling' | 'sora' | 'veo'
export type JobStatus = 'queued' | 'running' | 'preview' | 'scheduled' | 'uploading' | 'done' | 'failed' | 'rejected'

export interface Job {
  id: string
  channel_id: string | null
  status: JobStatus
  current_step: string | null
  progress: number
  model: VideoModel | null
  video_path: string | null
  scheduled_upload_at: string | null
  result_data: string | null
  error_message: string | null
  created_at: string
}

export interface Schedule {
  id: string
  channel_id: string
  cron_expression: string
  is_active: boolean
  next_run: string | null
  last_run: string | null
  created_at: string
}

// ── Channels ──────────────────────────────────────────────────────────────────
export const getChannels = () => api.get<Channel[]>('/api/channels').then(r => r.data)
export const getChannel = (id: string) => api.get<Channel>(`/api/channels/${id}`).then(r => r.data)
export const createChannel = (data: { name: string; genre: string; style_notes?: string }) =>
  api.post<Channel>('/api/channels', data).then(r => r.data)
export const updateChannel = (id: string, data: Partial<Channel>) =>
  api.patch<Channel>(`/api/channels/${id}`, data).then(r => r.data)
export const deleteChannel = (id: string) => api.delete(`/api/channels/${id}`)

// ── Ideas ─────────────────────────────────────────────────────────────────────
export interface VideoIdea {
  id: string
  channel_id: string
  title: string
  notes: string | null
  status: 'pending' | 'in_progress' | 'done' | 'rejected'
  created_at: string
}

export const getIdeas = (channelId: string) =>
  api.get<VideoIdea[]>(`/api/ideas/channel/${channelId}`).then(r => r.data)
export const createIdea = (channelId: string, data: { title: string; notes?: string }) =>
  api.post<VideoIdea>(`/api/ideas/channel/${channelId}`, data).then(r => r.data)
export const updateIdea = (ideaId: string, data: { title?: string; notes?: string; status?: string }) =>
  api.patch<VideoIdea>(`/api/ideas/${ideaId}`, data).then(r => r.data)
export const deleteIdea = (ideaId: string) => api.delete(`/api/ideas/${ideaId}`)
export const generateIdeas = (channelId: string, count = 10) =>
  api.post<VideoIdea[]>(`/api/ideas/channel/${channelId}/generate`, { count }).then(r => r.data)

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const triggerJob = (channelId: string, model: VideoModel = 'anthropic', ideaId?: string) =>
  api.post<Job>(`/api/jobs/trigger/${channelId}`, { model, idea_id: ideaId ?? null }).then(r => r.data)
export const getJob = (jobId: string) => api.get<Job>(`/api/jobs/${jobId}`).then(r => r.data)
export const getChannelJobs = (channelId: string) =>
  api.get<Job[]>(`/api/jobs/channel/${channelId}`).then(r => r.data)
export const approveJob = (jobId: string) =>
  api.post<Job>(`/api/jobs/${jobId}/approve`).then(r => r.data)
export const scheduleJob = (jobId: string, uploadAt: string) =>
  api.post<Job>(`/api/jobs/${jobId}/schedule`, { upload_at: uploadAt }).then(r => r.data)
export const rejectJob = (jobId: string) =>
  api.post<Job>(`/api/jobs/${jobId}/reject`).then(r => r.data)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const getAuthUrl = (channelId: string) =>
  api.get<{ auth_url: string }>(`/api/auth/youtube/${channelId}`).then(r => r.data)
export const disconnectChannel = (channelId: string) =>
  api.delete(`/api/auth/youtube/${channelId}`)

// ── Schedules ─────────────────────────────────────────────────────────────────
export const getSchedules = (channelId: string) =>
  api.get<Schedule[]>(`/api/schedules/channel/${channelId}`).then(r => r.data)
export const createSchedule = (channelId: string, cron_expression: string) =>
  api.post<Schedule>(`/api/schedules/channel/${channelId}`, { cron_expression }).then(r => r.data)
export const toggleSchedule = (scheduleId: string) =>
  api.patch<Schedule>(`/api/schedules/${scheduleId}/toggle`).then(r => r.data)
export const deleteSchedule = (scheduleId: string) =>
  api.delete(`/api/schedules/${scheduleId}`)

export interface ChannelStats {
  subscriber_count: number
  view_count: number
  video_count: number
  title: string
  thumbnail_url: string
}

export interface YTVideo {
  id: string
  title: string
  published_at: string
  thumbnail_url: string
  url: string
}

export const getChannelStats = (channelId: string) =>
  api.get<ChannelStats>(`/api/channels/${channelId}/stats`).then(r => r.data)

export const getChannelYTVideos = (channelId: string) =>
  api.get<YTVideo[]>(`/api/channels/${channelId}/yt-videos`).then(r => r.data)

export default api
