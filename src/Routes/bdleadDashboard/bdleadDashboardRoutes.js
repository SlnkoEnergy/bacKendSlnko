const router = require("express").Router();
const {  getAllLeads, getLeadSummary, getLeadSource, taskDashboard, leadSummary,  leadconversationrate, getLeadByLeadIdorId, leadFunnel }=require("../../Controllers/bdController/bdleadDashboard");
const { getNotesById, createNotes, updateNotes, deleteNotes, getNotesByLeadId } = require("../../Controllers/bdController/notesController");
const { getTaskById, createTask, updateTask, deleteTask } = require("../../Controllers/bdController/taskController");

// Bd lead Dashboard Routes
router.get("/summary",getLeadSummary);
router.get("/lead-source",getLeadSource);
router.get("/taskdashboard",taskDashboard);
router.get("/lead-summary",leadSummary);
router.get("/lead-conversation",leadconversationrate);

// Lead Routes
router.get("/all-lead", getAllLeads);
router.get("/lead-details", getLeadByLeadIdorId);
router.get("/lead-funnel",leadFunnel);

// Task Routes
router.get('/bd-tasks/:_id', getTaskById);        
router.post('/bd-tasks', createTask);      
router.put('/bd-tasks/:_id', updateTask);         
router.delete('/bd-tasks/:_id', deleteTask);      

//Notes Routes
router.get('/bd-notes/:_id', getNotesById);        
router.post('/bd-notes', createNotes);      
router.put('/bd-notes/:_id', updateNotes);         
router.delete('/bd-notes/:_id', deleteNotes);  
router.get('/bd-notes', getNotesByLeadId);
module.exports = router;