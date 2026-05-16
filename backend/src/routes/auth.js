import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { env, GOOGLE_OAUTH_CONFIGURED } from '../env.js';
import { googleAuthUrl, oauthClient } from '../services/youtube.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { encrypt } from '../lib/crypto.js';

const router = Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── Email + password registration ───────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim() || null;

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword(password),
        image: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(email)}`,
      },
    });
    // Token == userId for the slice session model (see lib/auth.js).
    res.status(201).json({ token: user.id, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    next(e);
  }
});

// ── Email + password login ──────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: user.id, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    next(e);
  }
});

// Tells the frontend whether REAL Google OAuth is available.
router.get('/google', (_req, res) => {
  res.json({ configured: GOOGLE_OAUTH_CONFIGURED });
});

// Step 1 of the real connect flow. The signed-in user opens this URL in the
// browser; `state` carries their app session token so the callback links the
// connected Google account to THIS user (not a brand-new one).
router.get('/google/start', async (req, res, next) => {
  try {
    if (!GOOGLE_OAUTH_CONFIGURED) {
      return res
        .status(503)
        .send('Google OAuth not configured. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.');
    }
    const state = String(req.query.state ?? '');
    const user = state && (await prisma.user.findUnique({ where: { id: state } }));
    if (!user) return res.status(401).send('Sign in first, then connect a Google account.');
    res.redirect(googleAuthUrl(state));
  } catch (e) {
    next(e);
  }
});

// Step 2: Google redirects here with ?code & ?state. Exchange the code,
// link the Google account (real channels) to the user from `state`.
router.get('/google/callback', async (req, res, next) => {
  const FRONT = env.FRONTEND_URL;
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${FRONT}/dashboard?connect_error=${encodeURIComponent(String(error))}`);

    const user = state && (await prisma.user.findUnique({ where: { id: String(state) } }));
    if (!user) return res.redirect(`${FRONT}/?connect_error=session_expired`);

    const client = oauthClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);
    const oauth2 = (await import('googleapis')).google.oauth2({ version: 'v2', auth: client });
    const me = (await oauth2.userinfo.get()).data;

    // A Google account can only be linked to one app user at a time.
    const existing = await prisma.googleAccount.findUnique({ where: { googleSub: me.id } });
    if (existing && existing.userId !== user.id) {
      return res.redirect(`${FRONT}/dashboard?connect_error=account_linked_elsewhere`);
    }

    const data = {
      email: me.email ?? 'unknown',
      displayName: me.name ?? null,
      avatarUrl: me.picture ?? null,
      accessToken: tokens.access_token ?? null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      // Refresh token only returned on first consent — keep the old one if absent.
      ...(tokens.refresh_token ? { refreshTokenEnc: encrypt(tokens.refresh_token) } : {}),
    };

    if (existing) {
      await prisma.googleAccount.update({ where: { id: existing.id }, data });
    } else {
      await prisma.googleAccount.create({
        data: { userId: user.id, googleSub: me.id, ...data },
      });
    }
    res.redirect(`${FRONT}/dashboard?connected=1`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('OAuth callback failed:', e?.message);
    res.redirect(`${FRONT}/dashboard?connect_error=oauth_failed`);
  }
});

export default router;
