const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./maintenance.controller');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', authorize('ADMIN', 'MANAGER'), ctrl.create);
router.patch('/:id', authorize('ADMIN', 'MANAGER'), ctrl.update);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), ctrl.remove);

module.exports = router;
