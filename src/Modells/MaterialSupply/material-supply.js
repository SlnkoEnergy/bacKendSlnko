const mongoose = require("mongoose");



const materialSupplySchema = new mongoose.Schema({
    project_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "projectDetail",
        },
    item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref:"moduleCategory",
        },
    po_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "purchaseOrder",
        },
    scope_history:[{
           status:{
            type:String,
            enum:["slnko", "client"],
           },
           user_id:{
            type: mongoose.Schema.Types.ObjectId,
            ref:"User",
           },
           remarks:{
            type:String,
           }
        }],
    pr_no:{
            type:String,
        },
    etd:{
        type:Date,
    },
    delivery_date:{
        type:Date,
    }

})
module.exports = mongoose.model("MaterialSupply", materialSupplySchema);