const { default: mongoose } = require("mongoose");

const moneySchema= new mongoose.Schema({

    p_id:{
        type:String,
    },
    projectGroup:{
        type:String
    },
    crediteAmount:{
        type:String

    },
    crediteMode:{
        type:String
    },
    comment:{
        type:String
    },
    submittedBy:{
        type:String
    }

},{timestamps:true});

module.exports = mongoose.model("addMoney", moneySchema);
