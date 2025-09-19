const router = require("express").Router();
const { createActivity, editActivity, deleteActivity, namesearchOfActivities } = require("../controllers/activities.controller");
const jwtMW = require("../middlewares/auth");

router.post('/activity', jwtMW.authentication, createActivity);
router.put('/activity/:id', jwtMW.authentication, editActivity);
router.delete('/activity/:id', jwtMW.authentication, deleteActivity);
router.get('/activities', jwtMW.authentication, namesearchOfActivities);

module.exports = router;