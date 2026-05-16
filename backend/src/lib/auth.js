import { prisma } from './prisma.js';

// Slice-level session: the opaque Bearer token IS the user id. NextAuth.js
// replaces this in production (JWT + secure cookie); the route contract here
// stays identical so the swap is isolated.
export async function requireUser(req, res, next) {
  try {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const user = await prisma.user.findUnique({ where: { id: token } });
    if (!user) return res.status(401).json({ error: 'Invalid session' });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
