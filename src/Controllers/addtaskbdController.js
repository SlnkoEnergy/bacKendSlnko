const taskModells =require("../Modells/addtaskbdModells");
const taskHistoryModells = require("../Modells/addtaskbdHistoryModells");

const addtask = async function (req,res) {
    try {
        const {name,date,reference,by_whom,comment,id, submitted_by} = req.body;
        const task = new taskModells({
            id,
            name,
            date,
            reference,
            by_whom,
            comment,
            submitted_by
        });
        await task.save();
        res.status(201).json({message:"Task Added Successfully",task:task});
    } catch (error) {
        res.status(500).json({message:"Internal Server Error"});
    }
    
};

//get add task 
 const getaddtask = async function (req,res) {
    try {
        const task = await taskModells.find();
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({message:"Internal Server Error"});
    }
 };
 

//edit comment with task history
const editComment = async function (req,res) {
    try {
        const id = req.params._id;
        const data = req.body;
        const task = await taskModells.findByIdAndUpdate(id,data,{new:true});
        const taskHistory = new taskHistoryModells({
            id:task.id,
            name:task.name,
            date:task.date,
            reference:task.reference,
            by_whom:task.by_whom,
            comment:task.comment,
            submitted_by:task.submitted_by
        });
        await taskHistory.save();
        res.status(200).json({message:"Comment Updated Successfully",task:task,taskHistory:taskHistory});
    } catch (error) {
        res.status(500).json({message:"Internal Server Error"+ error});
    }
};

//get task history
const gettaskHistory = async function (req,res) {
    try {
        const taskHistory = await taskHistoryModells.find();
        res.status(200).json(taskHistory);
    } catch (error) {
        res.status(500).json({message:"Internal Server Error"});
    }
};



module.exports = {addtask,getaddtask,editComment,gettaskHistory};