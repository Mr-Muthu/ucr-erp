const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./customers.controller');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', authorize('ADMIN', 'MANAGER', 'STAFF'), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', authorize('ADMIN', 'MANAGER', 'STAFF'), ctrl.update);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), ctrl.remove);

module.exports = router;
