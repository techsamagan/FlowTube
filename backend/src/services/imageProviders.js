import { MOCK_MODE } from '../env.js';

/**
 * Generate a base image using the specified image provider.
 * @param {string} prompt - Detailed visual prompt for the image.
 * @param {string} provider - Image provider name (FLUX, GEMINI, DALLE3, HIGGSFIELD).
 * @returns {Promise<string>} - Resolves to the public URL of the generated image.
 */
export async function generateBaseImage(prompt, provider = 'FLUX') {
  const p = String(provider).toUpperCase();
  console.log(`[ImageProvider] Generating base image using provider: ${p} for prompt: "${prompt.slice(0, 60)}..."`);

  // Force mock mode if explicitly enabled or if no keys are found
  const isMock = MOCK_MODE || shouldFallbackToMock(p);

  if (isMock) {
    console.log(`[ImageProvider] MOCK_MODE active for ${p}. Returning high-quality placeholder image.`);
    // Picsum returns a random 1080x1920 portrait image, perfect for YouTube Shorts.
    const randomId = Math.floor(Math.random() * 1000);
    return `https://picsum.photos/id/${randomId}/1080/1920`;
  }

  try {
    switch (p) {
      case 'FLUX':
        return await generateFluxFal(prompt);
      case 'GEMINI':
        return await generateGeminiImagen(prompt);
      case 'DALLE3':
        return await generateDalle3(prompt);
      case 'HIGGSFIELD':
        return await generateHiggsfieldImage(prompt);
      default:
        throw new Error(`Unsupported image provider: ${p}`);
    }
  } catch (err) {
    console.error(`[ImageProvider] Real provider ${p} failed:`, err.message);
    console.log(`[ImageProvider] Falling back to mock image.`);
    const randomId = Math.floor(Math.random() * 1000);
    return `https://picsum.photos/id/${randomId}/1080/1920`;
  }
}

function shouldFallbackToMock(provider) {
  switch (provider) {
    case 'FLUX':
      return !process.env.FAL_KEY;
    case 'GEMINI':
      return !process.env.GEMINI_API_KEY;
    case 'DALLE3':
      return !process.env.OPENAI_API_KEY;
    case 'HIGGSFIELD':
      return !process.env.HIGGSFIELD_API_KEY;
    default:
      return true;
  }
}

/**
 * Fal.ai Flux Schnell image generation
 */
async function generateFluxFal(prompt) {
  const url = 'https://queue.fal.run/fal-ai/flux/schnell';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      image_size: 'portrait_16_9', // returns portrait orientation suitable for vertical video
      sync_mode: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = result.images?.[0]?.url;
  if (!imageUrl) throw new Error('Fal.ai did not return an image URL');
  return imageUrl;
}

/**
 * Gemini Imagen 3 generation via Google Developer API
 */
async function generateGeminiImagen(prompt) {
  // Call Google Gemini Imagen 3 generation endpoint
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      numberOfImages: 1,
      outputMimeType: 'image/jpeg',
      aspectRatio: '9:16',
      personGeneration: 'allow_adult'
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini Imagen API error: ${response.status} - ${errBody}`);
  }

  const result = await response.json();
  const base64Image = result.generatedImages?.[0]?.image?.imageBytes;
  if (!base64Image) throw new Error('Gemini did not return image bytes');

  // Convert base64 to a data URL so that downloadTo function can fetch it
  return `data:image/jpeg;base64,${base64Image}`;
}

/**
 * OpenAI DALL-E 3 image generation
 */
async function generateDalle3(prompt) {
  const url = 'https://api.openai.com/v1/images/generations';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `${prompt} | Portrait orientation, 9:16 aspect ratio, high resolution, cinematic.`,
      n: 1,
      size: '1024x1792' // closest portrait size for DALL-E 3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = result.data?.[0]?.url;
  if (!imageUrl) throw new Error('DALL-E 3 did not return an image URL');
  return imageUrl;
}

/**
 * Higgsfield image generation stub
 */
async function generateHiggsfieldImage(prompt) {
  const url = 'https://api.higgsfield.ai/v1/image/generate';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '9:16',
      mode: 'cinematic'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Higgsfield API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = result.url || result.data?.url;
  if (!imageUrl) throw new Error('Higgsfield did not return an image URL');
  return imageUrl;
}
