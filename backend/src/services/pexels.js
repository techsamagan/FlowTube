import { writeFile } from 'node:fs/promises';
import { env, MOCK_MODE } from '../env.js';

// Pexels B-roll (spec pipeline Step 3). Picks portrait stock clips by
// keyword so they composite cleanly into a 1080x1920 Short.

const API = 'https://api.pexels.com/videos/search';

// Pull keywords from the script for relevant footage.
export function brollKeywords(script, niche) {
  const text = (script.title + ' ' + (script.fullScript ?? '')).toLowerCase();
  const stop = new Set(['the','a','an','and','or','but','to','of','in','on','for','is','it','you','your','this','that','with','what','why','how','they','i']);
  const words = text.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4 && !stop.has(w));
  const top = [...new Set(words)].slice(0, 3);
  return top.length ? top : [niche, 'cinematic background'];
}

/**
 * Search Pexels for portrait B-roll. Returns up to `count` direct video URLs,
 * each the highest-res portrait file available.
 */
export async function searchBroll(query, count = 3) {
  if (MOCK_MODE || !env.PEXELS_API_KEY) {
    throw new Error('Pexels not configured (set PEXELS_API_KEY, MOCK_MODE=false)');
  }
  const url = `${API}?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=${count * 3}`;
  const r = await fetch(url, { headers: { Authorization: env.PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels search ${r.status}`);
  const d = await r.json();
  const links = [];
  for (const v of d.videos ?? []) {
    // Prefer a portrait file with height >= 1280.
    const files = (v.video_files ?? [])
      .filter((f) => f.height >= f.width)
      .sort((a, b) => b.height - a.height);
    const pick = files.find((f) => f.height >= 1280) ?? files[0];
    if (pick?.link) links.push(pick.link);
    if (links.length >= count) break;
  }
  if (links.length === 0) throw new Error(`No Pexels B-roll for "${query}"`);
  return links;
}

export async function downloadTo(url, path) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`B-roll download ${r.status}`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
  return path;
}
