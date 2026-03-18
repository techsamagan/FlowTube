"""Upload a video to YouTube using the stored per-channel OAuth credentials."""
import json
import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from app.config import settings
from app.crypto import decrypt_token


def upload_to_youtube(
    video_path: str,
    title: str,
    description: str,
    tags: list[str],
    credentials_json_encrypted: str,
) -> str:
    """
    Upload video to YouTube. Returns the YouTube video ID.
    credentials_json_encrypted: the encrypted JSON string from Channel.credentials_json
    """
    creds_dict = json.loads(decrypt_token(credentials_json_encrypted))
    creds = Credentials(
        token=creds_dict.get("token"),
        refresh_token=creds_dict.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())

    youtube = build("youtube", "v3", credentials=creds)

    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": title[:100],
                "description": description,
                "tags": tags[:10],
                "categoryId": "22",  # People & Blogs — works for most Shorts
            },
            "status": {
                "privacyStatus": "public",
                "selfDeclaredMadeForKids": False,
            },
        },
        media_body=MediaFileUpload(video_path, chunksize=-1, resumable=True),
    )

    response = None
    while response is None:
        _, response = request.next_chunk()

    return response.get("id", "")
