// src/middlewares/permifyMiddleware.js
const { checkPermission } = require('../utils/permify');

function authorize({ permission, resourceParam = 'id', resourceType }) {
  return async (req, res, next) => {
    const userId = req.user?.id || req.body.userId; // From auth middleware or token
    const resourceId = req.params[resourceParam];

    if (!userId || !resourceId) {
      return res.status(400).json({ error: 'Missing userId or resourceId' });
    }

    const allowed = await checkPermission({
      userId,
      resourceId,
      resourceType,
      permission
    });

    if (!allowed) {
      return res.status(403).json({ error: 'Access denied by Permify' });
    }

    next();
  };
}

module.exports = { authorize };
