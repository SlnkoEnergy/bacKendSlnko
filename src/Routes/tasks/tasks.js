var router = require("express").Router();

const { createTask, getAllTasks, updateTask, getTaskById, deleteTask, updateTaskStatus }=require("../../Controllers/tasksController/tasksControllers");
const jwtMW = require("../../middlewares/auth");

router.post('/create-task',jwtMW.authentication, jwtMW.authorization, createTask);
router.get('/get-task', jwtMW.authentication, jwtMW.authorization, getAllTasks); 
router.get('/get-task/:id', jwtMW.authentication, jwtMW.authorization, getTaskById);
router.put('/update-task/:id', jwtMW.authentication, jwtMW.authorization, updateTask); 
router.delete('/delete-task/:id',jwtMW.authentication, jwtMW.authorization, deleteTask );
router.put('/:id/updateTaskStatus', jwtMW.authentication, jwtMW.authorization,updateTaskStatus);
module.exports = router;