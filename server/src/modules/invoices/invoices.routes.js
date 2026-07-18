const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./invoices.controller');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/generate', authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), ctrl.generate);
router.get('/:id', ctrl.get);
router.post('/:id/items', authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), ctrl.addItem);
router.patch('/:id/status', authorize('ADMIN', 'MANAGER', 'ACCOUNTANT'), ctrl.updateStatus);

module.exports = router;
