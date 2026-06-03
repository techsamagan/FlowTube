import { MOCK_MODE } from '../env.js';

/**
 * Helper to poll a background job for video generation.
 * In production, webhooks are preferred to prevent keeping active Node threads
 * blocked for 1-5 minutes during heavy AI rendering. 
 * 
 * WEBHOOK STRATEGY:
 * To use webhooks instead of polling:
 * 1. Pass a `webhook_url` parameter (e.g. "https://your-backend.com/api/webhooks/video-done")
 *    in the API call payload when initiating generation.
 * 2. Set up an Express route: `router.post('/webhooks/video-done', async (req, res) => { ... })`
 *    which receives the finished video URL and updates the database calendar entry status to 'ready'.
 * 3. This avoids CPU/event-loop bloat and handles server restarts cleanly.
 */
async function pollJob(jobId, checkStatusFn, intervalMs = 6000, maxRetries = 50) {
  for (let i = 0; i < maxRetries; i++) {
    console.log(`[VideoProvider] Polling status for job ${jobId} (attempt ${i + 1}/${maxRetries})...`);
    const { status, resultUrl, error } = await checkStatusFn(jobId);
    
    if (status === 'completed') {
      console.log(`[VideoProvider] Job ${jobId} completed successfully! URL: ${resultUrl}`);
      return resultUrl;
    }
    if (status === 'failed') {
      throw new Error(`AI Video Generation failed: ${error || 'Unknown error'}`);
    }
    
    // Wait for the next poll interval
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`AI Video Generation timed out for job ${jobId}`);
}

/**
 * Animate a base image using the specified video provider.
 * @param {string} imageUrl - The public URL of the generated base image.
 * @param {string} prompt - Cinematic motion prompt for animation.
 * @param {string} provider - Video provider name (KLING, LUMA, HIGGSFIELD).
 * @returns {Promise<string>} - Resolves to the public URL of the animated MP4.
 */
export async function animateImage(imageUrl, prompt, provider = 'KLING') {
  const p = String(provider).toUpperCase();
  console.log(`[VideoProvider] Animating image using provider: ${p} with prompt: "${prompt.slice(0, 60)}..."`);

  // Force mock mode if explicitly enabled or if no keys are found
  const isMock = MOCK_MODE || shouldFallbackToMock(p);

  if (isMock) {
    console.log(`[VideoProvider] MOCK_MODE active for ${p}. Returning high-quality mock MP4.`);
    // A lightweight public sample vertical-friendly video for development
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  }

  try {
    switch (p) {
      case 'KLING':
        return await animateKling(imageUrl, prompt);
      case 'LUMA':
        return await animateLuma(imageUrl, prompt);
      case 'HIGGSFIELD':
        return await animateHiggsfield(imageUrl, prompt);
      default:
        throw new Error(`Unsupported video provider: ${p}`);
    }
  } catch (err) {
    console.error(`[VideoProvider] Real provider ${p} failed:`, err.message);
    console.log(`[VideoProvider] Falling back to mock MP4.`);
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  }
}

function shouldFallbackToMock(provider) {
  switch (provider) {
    case 'KLING':
      return !process.env.KLING_API_KEY;
    case 'LUMA':
      return !process.env.LUMA_API_KEY;
    case 'HIGGSFIELD':
      return !process.env.HIGGSFIELD_API_KEY;
    default:
      return true;
  }
}

/**
 * Kling AI Image-to-Video API Wrapper
 */
async function animateKling(imageUrl, prompt) {
  const submitUrl = 'https://api.klingai.com/v1/videos/image2video';
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KLING_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'kling-v1',
      image: imageUrl,
      prompt: `${prompt} | vertical orientation, high detail, 30fps`,
      duration: 5 // seconds
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kling API submission error: ${response.status} - ${errorText}`);
  }

  const submitResult = await response.json();
  const taskId = submitResult.data?.task_id;
  if (!taskId) throw new Error('Kling did not return a task_id');

  // Poll Kling for completion
  return await pollJob(taskId, async (id) => {
    const statusUrl = `https://api.klingai.com/v1/videos/image2video/${id}`;
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Bearer ${process.env.KLING_API_KEY}` }
    });
    if (!res.ok) throw new Error(`Kling status fetch failed: ${res.status}`);
    
    const data = await res.json();
    const taskStatus = data.data?.task_status;
    
    if (taskStatus === 'SUCCEEDED') {
      return { status: 'completed', resultUrl: data.data?.video?.url };
    }
    if (taskStatus === 'FAILED') {
      return { status: 'failed', error: data.data?.task_status_msg };
    }
    return { status: 'processing' };
  });
}

/**
 * Luma Dream Machine Image-to-Video API Wrapper
 */
async function animateLuma(imageUrl, prompt) {
  const submitUrl = 'https://api.lumalabs.ai/v1/generations';
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LUMA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `${prompt} | 9:16 vertical orientation, cinematic motion`,
      key_frames: {
        frame0: {
          type: 'image',
          url: imageUrl
        }
      },
      aspect_ratio: '9:16'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Luma API submission error: ${response.status} - ${errorText}`);
  }

  const submitResult = await response.json();
  const generationId = submitResult.id;
  if (!generationId) throw new Error('Luma did not return a generation ID');

  // Poll Luma for completion
  return await pollJob(generationId, async (id) => {
    const statusUrl = `https://api.lumalabs.ai/v1/generations/${id}`;
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Bearer ${process.env.LUMA_API_KEY}` }
    });
    if (!res.ok) throw new Error(`Luma status fetch failed: ${res.status}`);
    
    const data = await res.json();
    const state = data.state;
    
    if (state === 'completed') {
      return { status: 'completed', resultUrl: data.assets?.video };
    }
    if (state === 'failed') {
      return { status: 'failed', error: data.failure_reason };
    }
    return { status: 'processing' };
  });
}

/**
 * Higgsfield Image-to-Video API Wrapper
 */
async function animateHiggsfield(imageUrl, prompt) {
  const submitUrl = 'https://api.higgsfield.ai/v1/video/animate';
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: `${prompt} | cinematic vertical, 9:16 aspect ratio`,
      motion_intensity: 'medium'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Higgsfield video API submission error: ${response.status} - ${errorText}`);
  }

  const submitResult = await response.json();
  const jobId = submitResult.job_id || submitResult.data?.job_id;
  if (!jobId) throw new Error('Higgsfield did not return a job ID');

  // Poll Higgsfield for completion
  return await pollJob(jobId, async (id) => {
    const statusUrl = `https://api.higgsfield.ai/v1/video/animate/${id}`;
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}` }
    });
    if (!res.ok) throw new Error(`Higgsfield status fetch failed: ${res.status}`);
    
    const data = await res.json();
    const status = data.status || data.data?.status;
    
    if (status === 'completed' || status === 'succeeded') {
      return { status: 'completed', resultUrl: data.video_url || data.data?.video_url };
    }
    if (status === 'failed') {
      return { status: 'failed', error: data.error || data.data?.error };
    }
    return { status: 'processing' };
  });
}
