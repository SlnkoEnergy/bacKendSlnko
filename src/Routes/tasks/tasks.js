var router = require("express").Router();

const { createTask, getAllTasks, updateTask, getTaskById, deleteTask }=require("../../Controllers/tasksController/tasksControllers");

router.post('/create-task',createTask);
router.get('/get-task', getAllTasks); 
router.get('/get-task/:id', getTaskById);
router.put('/update-task/:id', updateTask); 
router.delete('/delete-task/:id',deleteTask );
module.exports = router;