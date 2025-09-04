const router = require("express").Router();
const {
  getLeadSummary,
  getLeadSource,
  taskDashboard,
  leadSummary,
  leadconversationrate,
  leadWonAndLost,
  leadFunnel,
} = require("../controllers/bdleadsdashboard.controller.js");
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
} = require("../controllers/bdgroup.controller.js");
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
} = require("../controllers/bdleads.controller.js");
const {
  getNotesById,
  createNotes,
  updateNotes,
  deleteNotes,
  getNotesByLeadId,
} = require("../controllers/bdnotes.controller.js");
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
} = require("../controllers/bdtask.controller.js");
const jwtMW = require("../middlewares/auth.js");
const upload = require("../middlewares/multer.js");

// Bd lead Dashboard Routes
router.get("/summary", jwtMW.authentication, getLeadSummary);
router.get("/lead-source", jwtMW.authentication, getLeadSource);
router.get("/taskdashboard", jwtMW.authentication, taskDashboard);
router.get("/lead-summary", jwtMW.authentication, leadSummary);
router.get("/lead-conversation", jwtMW.authentication, leadconversationrate);

// Lead Routes
router.get("/all-lead", jwtMW.authentication, getAllLeads);
router.get("/lead-details", jwtMW.authentication, getLeadByLeadIdorId);
router.get("/lead-funnel", jwtMW.authentication, leadFunnel);
router.get("/wonandlost", jwtMW.authentication, leadWonAndLost);
router.get("/all-lead-dropdown", jwtMW.authentication, getAllLeadDropdown);
router.put("/lead/:_id", jwtMW.authentication, editLead);
router.delete("/lead/:_id", jwtMW.authentication, deleteLead);
router.put("/assign-to", jwtMW.authentication, updateAssignedTo);
router.put("/attach-group", jwtMW.authentication, attachToGroup);
router.post("/export-lead", jwtMW.authentication, exportLeadsCSV);
router.put("/:_id/updateLeadStatus", jwtMW.authentication, updateLeadStatus);
router.put("/updateLeadStatusBulk", jwtMW.authentication, updateLeadStatusBulk);
router.put("/uploadDocuments", jwtMW.authentication, upload, uploadDocuments);
router.put(
  "/:_id/updateClosingDate",
  jwtMW.authentication,
  updateExpectedClosing
);
router.get("/states", jwtMW.authentication, getUniqueState);
router.put("/updatehandoverstatus", jwtMW.authentication, fixBdLeadsFields);
router.get("/lead-count", jwtMW.authentication, getLeadCounts);

// Task Routes
router.get("/bd-tasks/:_id", jwtMW.authentication, getTaskById);
router.post("/bd-tasks", jwtMW.authentication, createTask);
router.put("/bd-tasks/:_id", jwtMW.authentication, updateTask);
router.delete("/bd-tasks/:_id", jwtMW.authentication, deleteTask);
router.put("/:_id/updateStatus", jwtMW.authentication, updateStatus);
router.get("/all-tasks", jwtMW.authentication, getAllTask);
router.get("/bd-tasks", jwtMW.authentication, getTaskByLeadId);
router.put("/notification/:_id", jwtMW.authentication, toggleViewTask);
router.get("/notification", jwtMW.authentication, getNotifications);
router.get("/task-assign", jwtMW.authentication, getAllTaskByAssigned);
router.post("/task-export", jwtMW.authentication, getexportToCsv);

//Notes Routes
router.get("/bd-notes/:_id", jwtMW.authentication, getNotesById);
router.post("/bd-notes", jwtMW.authentication, createNotes);
router.put("/bd-notes/:_id", jwtMW.authentication, updateNotes);
router.delete("/bd-notes/:_id", jwtMW.authentication, deleteNotes);
router.get("/bd-notes", jwtMW.authentication, getNotesByLeadId);
router.post("/lead", jwtMW.authentication, createBDlead);
router.put(
  "/updateAssignedto",
  jwtMW.authentication,
  updateAssignedToFromSubmittedBy
);

//Group
router.post("/group", jwtMW.authentication, createGroup);
router.get("/group", jwtMW.authentication, getAllGroup);
router.get("/group/:id", jwtMW.authentication, getGroupById);
router.put("/group/:id", jwtMW.authentication, updateGroup);
router.put("/:id/updateGroupStatus", jwtMW.authentication, updateGroupStatus);
router.delete("/group/:id", jwtMW.authentication, deleteGroup);
router.get("/group-drop", jwtMW.authentication, getAllGroupDropdown);
router.post("/group-export", jwtMW.authentication, getexportToCSVGroup);

module.exports = router;
