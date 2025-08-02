// src/utils/permify.js
const axios = require('axios');

const PERMIFY_BASE_URL = 'http://localhost:3476/v1';
const TENANT_ID = 't1';

async function checkPermission({ userId, resourceId, resourceType, permission }) {
  try {
    const response = await axios.post(`${PERMIFY_BASE_URL}/permissions/check`, {
      tenant_id: TENANT_ID,
      entity: {
        type: resourceType,
        id: resourceId
      },
      subject: {
        type: 'user',
        id: userId
      },
      permission: permission
    });

    return response.data.can === 'RESULT_ALLOWED';
  } catch (error) {
    console.error('Permify check error:', error.message);
    return false;
  }
}

module.exports = { checkPermission };
