"""
Assemble images + voiceover (+ optional background music) into a 1080×1920
YouTube Shorts MP4 using MoviePy.
"""
import os
from PIL import Image as PILImage

from app.config import settings

TARGET_W, TARGET_H = 1080, 1920
FPS = 30


def _resize_image(img_path: str) -> str:
    """Center-crop and resize image to TARGET_W×TARGET_H."""
    img = PILImage.open(img_path).convert("RGB")
    w, h = img.size
    target_ratio = TARGET_W / TARGET_H
    current_ratio = w / h

    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    img = img.resize((TARGET_W, TARGET_H), PILImage.LANCZOS)
    img.save(img_path)
    return img_path


def assemble_video(
    image_paths: list[str],
    audio_path: str,
    title: str,
    job_id: str,
    music_path: str | None = None,
) -> str:
    """
    Combine images + voiceover (+ optional background music) into a YouTube Short.
    Music is mixed at low volume so the voiceover stays clearly audible.
    Returns path to the output MP4.
    """
    from moviepy import ImageClip, AudioFileClip, concatenate_videoclips, CompositeAudioClip

    out_dir = os.path.join(settings.storage_dir, "videos", job_id)
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "short.mp4")

    for p in image_paths:
        _resize_image(p)

    voiceover = AudioFileClip(audio_path)
    total_dur = voiceover.duration
    per_img = total_dur / len(image_paths)

    # Build video from image clips
    clips = [ImageClip(path).with_duration(per_img) for path in image_paths]
    video = concatenate_videoclips(clips, method="compose")

    # Mix background music under the voiceover
    if music_path and os.path.exists(music_path):
        bg_music = AudioFileClip(music_path)

        # Loop music if shorter than voiceover, trim if longer
        if bg_music.duration < total_dur:
            loops_needed = int(total_dur / bg_music.duration) + 1
            from moviepy import concatenate_audioclips
            bg_music = concatenate_audioclips([bg_music] * loops_needed)
        bg_music = bg_music.subclipped(0, total_dur)

        # Music at 15% volume so voice is clearly dominant
        bg_music = bg_music.with_volume_scaled(0.15)

        mixed = CompositeAudioClip([voiceover, bg_music])
        video = video.with_audio(mixed)
    else:
        video = video.with_audio(voiceover)

    video.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=os.path.join(out_dir, "temp_audio.m4a"),
        remove_temp=True,
        logger=None,
    )

    return output_path
