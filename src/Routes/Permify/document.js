const express = require('express');
const router = express.Router();
const { authorize } = require('../../middlewares/permifyMiddleware');

// Example protected GET route for a "document"
router.get(
  '/:id',
  authorize({
    permission: 'read',
    resourceType: 'document',
    resourceParam: 'id' // req.params.id will be used
  }),
  (req, res) => {
    res.json({ message: '✅ Access granted. User is allowed to read this document.' });
  }
);

module.exports = router;
