const mongoose = require("mongoose");
const htpanelsSchema = new mongoose.Schema({
    make: { type: String },
    vcb_make: { type: String },
    pt_ratio: { type: String },
    vcb_rating: { type: String },
    ct_make: { type: String },
    ct_ratio: { type: String },
    
    cabel_size_incoming: { type: String },
    pt_make: { type: String },
    status:{type:String},
   
    submitted_by:{type:String},
},{timestamps:true});   
module.exports = mongoose.model("HTpanel", htpanelsSchema);