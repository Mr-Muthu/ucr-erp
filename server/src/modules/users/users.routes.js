const router = require('express').Router();
const prisma = require('../../config/db');
const { authenticate, authorize } = require('../../middleware/auth');

// Minimal listing endpoint (e.g. to pick a User when linking a Driver login).
router.get('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

module.exports = router;
