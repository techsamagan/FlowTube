"""
YouTube OAuth 2.0 flow per channel.
Flow:
  1. GET /api/auth/youtube/{channel_id}   → returns {auth_url}
  2. User visits auth_url, approves
  3. Google redirects to /api/auth/youtube/callback?code=...&state={channel_id}
  4. Backend exchanges code → stores encrypted tokens on Channel
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Channel
from app.config import settings
from app.crypto import encrypt_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]

_pending_verifiers: dict[str, str] = {}  # channel_id → code_verifier


def _make_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = settings.google_redirect_uri
    return flow


@router.get("/youtube/callback")
async def oauth_callback(
    code: str,
    state: str,           # channel_id
    db: AsyncSession = Depends(get_db),
):
    ch = await db.get(Channel, state)
    if not ch:
        raise HTTPException(404, "Channel not found")

    flow = _make_flow()
    verifier = _pending_verifiers.pop(state, None)
    logger.info("oauth_callback: state=%s verifier_found=%s", state, bool(verifier))
    if verifier:
        flow.code_verifier = verifier
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error("fetch_token failed: %r", e)
        raise
    creds = flow.credentials

    # Get the actual YouTube channel ID
    youtube = build("youtube", "v3", credentials=creds)
    resp = youtube.channels().list(part="id,snippet", mine=True).execute()
    yt_channel_id = ""
    if resp.get("items"):
        yt_channel_id = resp["items"][0]["id"]

    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes),
    }

    ch.credentials_json = encrypt_token(json.dumps(token_data))
    ch.youtube_channel_id = yt_channel_id
    ch.connected = True
    await db.commit()

    # Redirect back to frontend channel detail page
    return RedirectResponse(url=f"{settings.frontend_url}/channels/{state}")


@router.get("/youtube/{channel_id}")
async def get_auth_url(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")

    flow = _make_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=channel_id,
        prompt="consent",
    )
    if flow.code_verifier:
        _pending_verifiers[channel_id] = flow.code_verifier
    logger.info("get_auth_url: channel_id=%s code_verifier_stored=%s", channel_id, bool(flow.code_verifier))
    return {"auth_url": auth_url}


@router.delete("/youtube/{channel_id}")
async def disconnect_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    ch.credentials_json = None
    ch.youtube_channel_id = None
    ch.connected = False
    await db.commit()
    return {"ok": True}
