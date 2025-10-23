const router = require("express").Router();
const {
  getEmails,
  getEmailById,
  createEmail,
  updateEmailStatus,
  getUniqueTags,
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
router.post("/", auth, createEmail);
router.put("/:id/status", auth, updateEmailStatus);
router.get('/tags', auth, getUniqueTags);
router.get("/:id", auth, getEmailById);

module.exports = router;
