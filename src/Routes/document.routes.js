const router = require('express').Router();
const { createDocument, getDocumentById, getAllDocuments, updateDocument, deleteDocument } = require('../Controllers/document.controller');
const auth = require('../middlewares/auth.middleware');
const upload = require('../middlewares/multer.middleware');

router.post('/', auth, createDocument);
router.get('/:id', auth, getDocumentById);
router.get('/', auth, getAllDocuments);
router.put('/:id', auth, updateDocument);
router.delete('/:id', auth, deleteDocument);

module.exports = router