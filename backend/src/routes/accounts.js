import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';

const router = Router();
router.use(requireUser);

// List the Google accounts connected to the signed-in user.
// Accounts are added only via real Google OAuth (see routes/auth.js).
router.get('/', async (req, res, next) => {
  try {
    const accounts = await prisma.googleAccount.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { channels: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.displayName,
        channelCount: a._count.channels,
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
