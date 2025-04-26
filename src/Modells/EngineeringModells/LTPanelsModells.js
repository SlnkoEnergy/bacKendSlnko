const mongoose = require("mongoose");
const ltpanelSchema = new mongoose.Schema({
    make: { type: String },
    
    type: { type: String },
 
    voltage: { type: String },
  
    status:{type:String},
    outgoing:{type:String},
    incoming:{type:String},
    submitted_by:{type:String},
},{timestamps:true});
module.exports = mongoose.model("ltpanel", ltpanelSchema);