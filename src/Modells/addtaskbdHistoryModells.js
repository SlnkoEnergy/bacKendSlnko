const mongoose = require("mongoose");
const addtaskbdHistorySchema = new mongoose.Schema({
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
    submitted_by:{
        type:String,
        default:""
    },

},{timestamps:true});
module.exports = mongoose.model("addtaskbdHistory",addtaskbdHistorySchema);
