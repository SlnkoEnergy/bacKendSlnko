const { default: mongoose } = require("mongoose");

const moneySchema= new mongoose.Schema({

    p_id:{
        type:String,
    },
  comment:{
        type:String
    },
    submitted_by:{
        type:String
    },
    cr_amount:{
    type:String
},
cr_date:{
    type:String
},
cr_mode:{
    type:String

}



},{timestamps:true});

module.exports = mongoose.model("addMoney", moneySchema);
