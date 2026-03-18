"""
Generate background music appropriate to the video's mood/genre using numpy synthesis.
Produces a WAV file with chord pads, bass pulses, and subtle melody.
"""
import os
import wave
import struct
import numpy as np

from app.config import settings

SAMPLE_RATE = 44100

# ── Music profiles ─────────────────────────────────────────────────────────────
# Each profile: chords (Hz triples), bass root (Hz), bpm, chord_beats
# Chord progressions use I-V-vi-IV or i-VII-VI-VII minor variants

_PROFILES = {
    "upbeat": {
        "chords": [
            [261.63, 329.63, 392.00],   # C maj
            [392.00, 493.88, 587.33],   # G maj
            [220.00, 261.63, 329.63],   # A min
            [349.23, 440.00, 523.25],   # F maj
        ],
        "bass": [130.81, 196.00, 110.00, 174.61],
        "bpm": 118, "chord_beats": 4,
    },
    "energetic": {
        "chords": [
            [293.66, 369.99, 440.00],   # D maj
            [246.94, 311.13, 369.99],   # B min
            [220.00, 277.18, 329.63],   # A maj
            [293.66, 369.99, 440.00],   # D maj
        ],
        "bass": [146.83, 123.47, 110.00, 146.83],
        "bpm": 130, "chord_beats": 4,
    },
    "inspirational": {
        "chords": [
            [261.63, 329.63, 392.00],   # C maj
            [349.23, 440.00, 523.25],   # F maj
            [293.66, 369.99, 440.00],   # G maj (as IV of IV)
            [261.63, 329.63, 392.00],   # C maj
        ],
        "bass": [130.81, 174.61, 196.00, 130.81],
        "bpm": 90, "chord_beats": 6,
    },
    "cheerful": {
        "chords": [
            [392.00, 493.88, 587.33],   # G maj
            [261.63, 329.63, 392.00],   # C maj
            [293.66, 369.99, 440.00],   # D maj
            [392.00, 493.88, 587.33],   # G maj
        ],
        "bass": [196.00, 130.81, 146.83, 196.00],
        "bpm": 100, "chord_beats": 4,
    },
    "calm": {
        "chords": [
            [195.99, 246.94, 293.66],   # G min
            [174.61, 220.00, 261.63],   # F maj
            [164.81, 207.65, 246.94],   # E min
            [174.61, 220.00, 261.63],   # F maj
        ],
        "bass": [97.99, 87.31, 82.41, 87.31],
        "bpm": 65, "chord_beats": 8,
    },
    "dramatic": {
        "chords": [
            [207.65, 261.63, 311.13],   # E min
            [185.00, 233.08, 277.18],   # F# min
            [174.61, 220.00, 261.63],   # F maj (bVI)
            [196.00, 246.94, 293.66],   # G maj
        ],
        "bass": [103.83, 92.50, 87.31, 98.00],
        "bpm": 85, "chord_beats": 6,
    },
    "mysterious": {
        "chords": [
            [233.08, 293.66, 349.23],   # A# min (Bb min)
            [207.65, 261.63, 311.13],   # E min
            [220.00, 277.18, 329.63],   # A maj
            [207.65, 261.63, 311.13],   # E min
        ],
        "bass": [116.54, 103.83, 110.00, 103.83],
        "bpm": 75, "chord_beats": 8,
    },
    "tense": {
        "chords": [
            [207.65, 261.63, 311.13],   # E min
            [220.00, 277.18, 329.63],   # A maj
            [196.00, 246.94, 311.13],   # G dim
            [207.65, 261.63, 311.13],   # E min
        ],
        "bass": [103.83, 110.00, 98.00, 103.83],
        "bpm": 95, "chord_beats": 4,
    },
}

# Map genre keywords to mood profiles
_GENRE_MOOD_MAP = [
    (["motivat", "fitness", "gym", "workout", "sport", "hustle"], "upbeat"),
    (["energ", "hype", "action", "rap", "hip hop", "gaming", "game"], "energetic"),
    (["inspir", "success", "mindset", "personal", "growth", "entrepreneur"], "inspirational"),
    (["cook", "food", "recipe", "travel", "adventure", "lifestyle", "fun"], "cheerful"),
    (["meditat", "yoga", "mindful", "relax", "sleep", "stress", "wellness", "nature"], "calm"),
    (["drama", "cinema", "movie", "storytell", "history", "war", "epic"], "dramatic"),
    (["mystery", "horror", "paranormal", "conspiracy", "true crime", "dark"], "mysterious"),
    (["thrill", "suspense", "crime", "finance", "crypto", "stock", "market"], "tense"),
]


def _genre_to_profile(genre_or_mood: str) -> dict:
    """Map a genre string or mood name to a music profile."""
    lower = genre_or_mood.lower()
    # Direct mood name match
    if lower in _PROFILES:
        return _PROFILES[lower]
    # Keyword match on genre
    for keywords, mood in _GENRE_MOOD_MAP:
        if any(k in lower for k in keywords):
            return _PROFILES[mood]
    return _PROFILES["inspirational"]  # default


# ── Synthesis ──────────────────────────────────────────────────────────────────

def _pad_chord(freqs: list[float], duration: float, detune: float = 0.003) -> np.ndarray:
    """Synthesize a lush chord pad with harmonics, detuning, and tremolo."""
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    audio = np.zeros(n, dtype=np.float64)

    for freq in freqs:
        for voice_offset in [-detune, 0.0, detune]:
            f = freq * (1 + voice_offset)
            # Harmonics weighted by 1/harmonic^1.5
            for h in range(1, 7):
                amp = 0.35 / (h ** 1.5)
                audio += amp * np.sin(2 * np.pi * f * h * t)

    # Tremolo (subtle wobble at ~5 Hz)
    audio *= 1.0 + 0.025 * np.sin(2 * np.pi * 5.2 * t)

    # Smooth ADSR envelope
    attack_s = min(0.35, duration * 0.15)
    release_s = min(0.5, duration * 0.2)
    attack_n = int(attack_s * SAMPLE_RATE)
    release_n = int(release_s * SAMPLE_RATE)

    env = np.ones(n)
    env[:attack_n] = np.linspace(0.0, 1.0, attack_n)
    env[n - release_n:] = np.linspace(1.0, 0.0, release_n)

    return audio * env


def _bass_pulse(freq: float, duration: float, bpm: int) -> np.ndarray:
    """Generate a punchy bass note pulsing every beat."""
    n = int(SAMPLE_RATE * duration)
    audio = np.zeros(n, dtype=np.float64)
    beat_samples = int(SAMPLE_RATE * 60.0 / bpm)
    note_samples = int(beat_samples * 0.45)  # note lasts 45% of a beat

    for beat_start in range(0, n, beat_samples):
        end = min(beat_start + note_samples, n)
        length = end - beat_start
        if length <= 0:
            continue
        t_local = np.linspace(0, length / SAMPLE_RATE, length, endpoint=False)
        note = (
            0.5 * np.sin(2 * np.pi * freq * t_local)
            + 0.25 * np.sin(2 * np.pi * freq * 2 * t_local)
        )
        env = np.exp(-t_local * 7.0)
        audio[beat_start:end] += note * env * 0.6

    return audio


def _simple_reverb(signal: np.ndarray, delay_ms: int = 55, decay: float = 0.22) -> np.ndarray:
    """Add a single early reflection for a light sense of space."""
    delay_samples = int(SAMPLE_RATE * delay_ms / 1000)
    out = signal.copy()
    if delay_samples < len(signal):
        out[delay_samples:] += signal[: len(signal) - delay_samples] * decay
    return out


def _normalize(audio: np.ndarray, target_peak: float = 0.18) -> np.ndarray:
    """Normalize to target peak amplitude (keeps music quiet vs. voiceover)."""
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio * (target_peak / peak)
    return audio


def generate_music(mood_or_genre: str, duration: float, job_id: str) -> str:
    """
    Generate background music WAV appropriate to the mood/genre.
    Returns path to the saved WAV file.
    """
    out_dir = os.path.join(settings.storage_dir, "audio", job_id)
    os.makedirs(out_dir, exist_ok=True)
    music_path = os.path.join(out_dir, "music.wav")

    profile = _genre_to_profile(mood_or_genre)
    chords = profile["chords"]
    basses = profile["bass"]
    bpm = profile["bpm"]
    chord_beats = profile["chord_beats"]

    beat_dur = 60.0 / bpm
    chord_dur = beat_dur * chord_beats

    total_samples = int(SAMPLE_RATE * duration)
    audio = np.zeros(total_samples, dtype=np.float64)

    # Build progression, repeating until duration is filled
    pos = 0
    chord_idx = 0
    while pos < total_samples:
        remaining = total_samples - pos
        seg_dur = min(chord_dur, remaining / SAMPLE_RATE)
        seg_n = int(seg_dur * SAMPLE_RATE)

        pad = _pad_chord(chords[chord_idx % len(chords)], seg_dur)
        bass = _bass_pulse(basses[chord_idx % len(basses)], seg_dur, bpm)

        seg = pad + bass
        audio[pos: pos + seg_n] += seg[:seg_n]

        pos += seg_n
        chord_idx += 1

    # Apply reverb and normalize
    audio = _simple_reverb(audio)
    audio = _normalize(audio, target_peak=0.18)

    # Fade in/out (0.5s each)
    fade_n = min(int(0.5 * SAMPLE_RATE), total_samples // 4)
    audio[:fade_n] *= np.linspace(0.0, 1.0, fade_n)
    audio[-fade_n:] *= np.linspace(1.0, 0.0, fade_n)

    # Write as 16-bit mono WAV
    pcm = np.clip(audio, -1.0, 1.0)
    pcm_int = (pcm * 32767).astype(np.int16)

    with wave.open(music_path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(struct.pack(f"<{len(pcm_int)}h", *pcm_int))

    return music_path
