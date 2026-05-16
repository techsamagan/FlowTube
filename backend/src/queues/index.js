import { Queue } from 'bullmq';

// BullMQ scaffolding for the video-assembly + analysis pipelines (spec §4/§5).
// Lazily constructed so the vertical slice runs WITHOUT Redis. The 7-step
// pipeline (script→TTS→b-roll→FFmpeg→thumb→metadata→upload) and the 48h
// viral-analysis job attach their processors here in a later pass.

let videoQueue = null;
let analysisQueue = null;

function connection() {
  return { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } };
}

export function getVideoQueue() {
  if (!process.env.REDIS_URL) return null; // no-op when Redis absent (mock/dev)
  if (!videoQueue) videoQueue = new Queue('video-pipeline', connection());
  return videoQueue;
}

export function getAnalysisQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!analysisQueue) analysisQueue = new Queue('viral-analysis', connection());
  return analysisQueue;
}
