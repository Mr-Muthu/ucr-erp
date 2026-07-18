const router = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./vehicles.controller');

router.use(authenticate);

router.get('/expiring-documents', ctrl.expiringDocuments);

router.get('/', ctrl.list);
router.post('/', authorize('ADMIN', 'MANAGER'), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', authorize('ADMIN', 'MANAGER'), ctrl.update);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), ctrl.remove);

router.post('/:id/documents', authorize('ADMIN', 'MANAGER'), ctrl.addDocument);
router.delete('/:id/documents/:docId', authorize('ADMIN', 'MANAGER'), ctrl.removeDocument);

module.exports = router;
