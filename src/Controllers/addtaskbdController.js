const taskModells =require("../Modells/addtaskbdModells");

const addtask = async function (req,res) {
    try {
        const {name,date,reference,by_whom,comment} = req.body;
        const task = new taskModells({
            name,
            date,
            reference,
            by_whom,
            comment
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

module.exports = {addtask,getaddtask};