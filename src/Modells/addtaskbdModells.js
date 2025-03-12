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

},{timestamps:true});
module.exports = mongoose.model("addtask",addtaskSchema);           