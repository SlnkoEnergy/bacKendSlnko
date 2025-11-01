const router = require("express").Router();
const {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  leadWonAndLost,
  leadFunnel,
} = require("../Controllers/bdleadsdashboard.controller.js");
const {
  createGroup,
  getAllGroup,
  getGroupById,
  updateGroup,
  deleteGroup,
  updateGroupStatus,
  groupDropdown,
  getAllGroupDropdown,
  getexportToCSVGroup,
} = require("../Controllers/bdgroup.controller.js");
const {
  deleteLead,
  updateAssignedTo,
  exportLeadsCSV,
  updateLeadStatus,
  uploadDocuments,
  updateExpectedClosing,
  getLeadByLeadIdorId,
  getAllLeads,
  getAllLeadDropdown,
  editLead,
  createBDlead,
  updateAssignedToFromSubmittedBy,
  attachToGroup,
  getUniqueState,
  fixBdLeadsFields,
  getLeadCounts,
  updateLeadStatusBulk,
  updatePriority,
  getDocuments
} = require("../Controllers/bdleads.controller.js");
const {
  getNotesById,
  createNotes,
  updateNotes,
  deleteNotes,
  getNotesByLeadId,
} = require("../Controllers/bdnotes.controller.js");
const {
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateStatus,
  getAllTask,
  getTaskByLeadId,
  toggleViewTask,
  getNotifications,
  getAllTaskByAssigned,
  getexportToCsv,
} = require("../Controllers/bdtask.controller.js");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");

// Bd lead Dashboard Routes
router.get("/summary", auth, getLeadSummary);
router.get("/lead-source", auth, getLeadSource);
router.get("/taskdashboard", auth, taskDashboard);
router.get("/lead-summary", auth, leadSummary);
router.get("/lead-conversation", auth, leadconversationrate);

// Lead Routes
router.get("/all-lead", auth, getAllLeads);
router.get("/lead-details", auth, getLeadByLeadIdorId);
router.get("/lead-funnel", auth, leadFunnel);
router.get("/wonandlost", auth, leadWonAndLost);
router.get("/all-lead-dropdown", auth, getAllLeadDropdown);
router.put("/lead/:_id", auth, editLead);
router.delete("/lead/:_id", auth, deleteLead);
router.put("/assign-to", auth, updateAssignedTo);
router.put("/attach-group", auth, attachToGroup);
router.post("/export-lead", auth, exportLeadsCSV);
router.put("/:_id/updateLeadStatus", auth, updateLeadStatus);
router.put("/updateLeadStatusBulk", auth, updateLeadStatusBulk);
router.put("/updatePriority", auth, updatePriority);
router.put("/uploadDocuments", auth, upload, uploadDocuments);
router.put(
  "/:_id/updateClosingDate",
  auth,
  updateExpectedClosing
);
router.get("/states", auth, getUniqueState);
router.put("/updatehandoverstatus", auth, fixBdLeadsFields);
router.get("/lead-count", auth, getLeadCounts);
router.get('/lead-documents', auth, getDocuments);

// Task Routes
router.get("/bd-tasks/:_id", auth, getTaskById);
router.post("/bd-tasks", auth, createTask);
router.put("/bd-tasks/:_id", auth, updateTask);
router.delete("/bd-tasks/:_id", auth, deleteTask);
router.put("/:_id/updateStatus", auth, updateStatus);
router.get("/all-tasks", auth, getAllTask);
router.get("/bd-tasks", auth, getTaskByLeadId);
router.put("/notification/:_id", auth, toggleViewTask);
router.get("/notification", auth, getNotifications);
router.get("/task-assign", auth, getAllTaskByAssigned);
router.post("/task-export", auth, getexportToCsv);

//Notes Routes
router.get("/bd-notes/:_id", auth, getNotesById);
router.post("/bd-notes", auth, createNotes);
router.put("/bd-notes/:_id", auth, updateNotes);
router.delete("/bd-notes/:_id", auth, deleteNotes);
router.get("/bd-notes", auth, getNotesByLeadId);
router.post("/lead", auth, createBDlead);
router.put(
  "/updateAssignedto",
  auth,
  updateAssignedToFromSubmittedBy
);

//Group
router.post("/group", auth, createGroup);
router.get("/group", auth, getAllGroup);
router.get("/group/:id", auth, getGroupById);
router.put("/group/:id", auth, updateGroup);
router.put("/:id/updateGroupStatus", auth, updateGroupStatus);
router.delete("/group/:id", auth, deleteGroup);
router.get("/group-drop", auth, getAllGroupDropdown);
router.post("/group-export", auth, getexportToCSVGroup);

module.exports = router;
