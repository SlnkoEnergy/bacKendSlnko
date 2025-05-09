const mongoose= require("mongoose");
const addtaskSchema = new mongoose.Schema({
    id:{
        type:String,
        default:""
    },
    name:{
        type:String,
        default:""
    },
    date:{
        type:String,
        default:""
    },
    reference:{
        type:String,
        default:""
    },
    by_whom:{
        type:String,
        default:""
    },
    comment:{
        type:String,
        default:""
    },
    task_detail:{
        type:String,
        default:""
    },
    notification_message:{
        type:String,
        default:""
    },
    status:{
        type:String,
        
    },
    submitted_by:{
        type:String,
        default:""
    },

},{timestamps:true});
module.exports = mongoose.model("addtask",addtaskSchema);           