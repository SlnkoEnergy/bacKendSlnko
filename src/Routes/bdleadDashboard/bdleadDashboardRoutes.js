const router = require("express").Router();
const {  getAllLeads, getLeadSummary, getLeadSource, taskDashboard, leadSummary,  leadconversationrate, getLeadByLeadIdorId, leadWonAndLost, leadFunnel, getAllLeadDropdown }=require("../../Controllers/bdController/bdleadDashboard");
const { getNotesById, createNotes, updateNotes, deleteNotes, getNotesByLeadId } = require("../../Controllers/bdController/notesController");
const { getTaskById, createTask, updateTask, deleteTask, updateStatus, getAllTask } = require("../../Controllers/bdController/taskController");
const jwtMW = require("../../middlewares/auth");
// Bd lead Dashboard Routes
router.get("/summary",jwtMW.authentication, jwtMW.authorization,getLeadSummary);
router.get("/lead-source",jwtMW.authentication, jwtMW.authorization,getLeadSource);
router.get("/taskdashboard",jwtMW.authentication, jwtMW.authorization,taskDashboard);
router.get("/lead-summary",jwtMW.authentication, jwtMW.authorization,leadSummary);
router.get("/lead-conversation",jwtMW.authentication, jwtMW.authorization,leadconversationrate);

// Lead Routes
router.get("/all-lead",jwtMW.authentication, jwtMW.authorization, getAllLeads);
router.get("/lead-details",jwtMW.authentication, jwtMW.authorization, getLeadByLeadIdorId);
router.get("/lead-funnel", jwtMW.authentication, jwtMW.authorization, leadFunnel);
router.get("/wonandlost", jwtMW.authentication, jwtMW.authorization, leadWonAndLost);
router.get('/all-lead-dropdown',jwtMW.authentication, jwtMW.authorization, getAllLeadDropdown)

// Task Routes
router.get('/bd-tasks/:_id',jwtMW.authentication, jwtMW.authorization, getTaskById);        
router.post('/bd-tasks', jwtMW.authentication, jwtMW.authorization,createTask);      
router.put('/bd-tasks/:_id', jwtMW.authentication, jwtMW.authorization,updateTask);         
router.delete('/bd-tasks/:_id',jwtMW.authentication, jwtMW.authorization, deleteTask);      
router.put('/:_id/updateStatus', jwtMW.authentication, jwtMW.authorization, updateStatus)
router.get('/all-tasks', jwtMW.authentication, jwtMW.authorization, getAllTask);

//Notes Routes
router.get('/bd-notes/:_id',jwtMW.authentication, jwtMW.authorization, getNotesById);        
router.post('/bd-notes',jwtMW.authentication, jwtMW.authorization, createNotes);      
router.put('/bd-notes/:_id',jwtMW.authentication, jwtMW.authorization, updateNotes);         
router.delete('/bd-notes/:_id',jwtMW.authentication, jwtMW.authorization, deleteNotes);  
router.get('/bd-notes',jwtMW.authentication, jwtMW.authorization, getNotesByLeadId);
module.exports = router;