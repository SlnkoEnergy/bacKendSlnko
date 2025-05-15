const express = require('express');
const { getProjectBalance } = require('../Controllers/projectBalanceController/projectBalanceController');
const router = express.Router();

router.get("/project-balance", getProjectBalance);

module.exports = router;