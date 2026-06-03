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
    console.log(`[VideoProvider] MOCK_MODE active for ${p}. Will generate a local placeholder clip.`);
    // Return a sentinel — the pipeline generates the clip via FFmpeg (no external URL).
    return 'mock:generate';
  }

  try {
    switch (p) {
      case 'VEO':
        return await animateVeo(imageUrl, prompt);
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
    console.log(`[VideoProvider] Falling back to local mock clip.`);
    return 'mock:generate';
  }
}

function shouldFallbackToMock(provider) {
  switch (provider) {
    case 'VEO':
      // Veo uses the same Vertex AI key/project pair as Imagen.
      return !process.env.GEMINI_API_KEY || !(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
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
 * Google Veo (Vertex AI) Image-to-Video Wrapper.
 *
 * Uses the same AQ. Vertex Express key + Google Cloud project as the
 * Imagen path. The image arrives as either a data: URL (returned by our
 * Imagen step) or an https URL; Veo wants raw bytes, so we normalise to
 * base64 before submitting.
 */
async function animateVeo(imageUrl, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  const location = 'us-central1';
  const model = process.env.VEO_MODEL || 'veo-2.0-generate-001';

  const { bytesB64, mimeType } = await imageToBase64(imageUrl);

  const submitUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predictLongRunning?key=${apiKey}`;
  const submit = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{
        prompt: `${prompt} | vertical 9:16, cinematic motion, smooth camera`,
        image: { bytesBase64Encoded: bytesB64, mimeType },
      }],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds: 5,
        sampleCount: 1,
        personGeneration: 'allow_adult',
      },
    }),
  });

  if (!submit.ok) {
    const errBody = await submit.text();
    throw new Error(`Veo submit error: ${submit.status} - ${errBody}`);
  }

  const submitJson = await submit.json();
  const operationName = submitJson.name;
  if (!operationName) throw new Error('Veo did not return an operation name');

  const fetchUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation?key=${apiKey}`;

  return await pollJob(operationName, async (name) => {
    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: name }),
    });
    if (!res.ok) throw new Error(`Veo poll error: ${res.status}`);
    const data = await res.json();
    if (data.error) return { status: 'failed', error: data.error.message };
    if (!data.done) return { status: 'processing' };
    const video = data.response?.videos?.[0] ?? data.response?.generatedSamples?.[0]?.video;
    const url = video?.gcsUri || video?.uri;
    const inlineBytes = video?.bytesBase64Encoded;
    if (url) return { status: 'completed', resultUrl: url };
    if (inlineBytes) {
      return { status: 'completed', resultUrl: `data:video/mp4;base64,${inlineBytes}` };
    }
    return { status: 'failed', error: 'Veo response missing video payload' };
  }, 8000, 60);
}

// Normalise an image source (data: URL or https URL) to { bytesB64, mimeType }.
async function imageToBase64(imageUrl) {
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Malformed data URL for Veo input');
    return { mimeType: match[1], bytesB64: match[2] };
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image for Veo: ${res.status}`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType, bytesB64: buf.toString('base64') };
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
