const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

router.post('/login', ctrl.login);
// Only an already-authenticated ADMIN/MANAGER can create new staff logins.
router.post('/register', authenticate, authorize('ADMIN', 'MANAGER'), ctrl.register);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
