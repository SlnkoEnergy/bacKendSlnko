const { default: mongoose } = require("mongoose");

const moneySchema= new mongoose.Schema({

    p_id:{
        type:Number,
    },
  comment:{
        type:String
    },
    submitted_by:{
        type:String
    },
    cr_amount:{
    type:Number
},
cr_date:{
    type:Date
},
cr_mode:{
    type:String

}



},{timestamps:true});

module.exports = mongoose.model("addMoney", moneySchema);
