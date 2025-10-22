const router = require("express").Router();
const {
  getEmails,
  getEmailById,
  createEmail,
} = require("../Controllers/email.controller");
const {
  getEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  updateEmailTemplateStatus,
  deleteEmailTemplate,
} = require("../Controllers/emailtemplate.controller");
const auth = require("../middlewares/auth.middleware");

//Templates Routes
router.get("/template", auth, getEmailTemplates);
router.get("/template/:id", auth, getEmailTemplateById);
router.post("/template", auth, createEmailTemplate);
router.put("/template/:id", auth, updateEmailTemplate);
router.put("/template/:id/status", auth, updateEmailTemplateStatus);
router.delete("/template/:id", auth, deleteEmailTemplate);

// Email Routes
router.get("/", auth, getEmails);
router.get("/:id", auth, getEmailById);
router.post("/", auth, createEmail);

module.exports = router;
