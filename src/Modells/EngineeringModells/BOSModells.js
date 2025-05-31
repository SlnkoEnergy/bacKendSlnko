const mongoose = require("mongoose");
const bosSchema = new mongoose.Schema({
  category: {
    type: String,
  },
  itemName: {
    type: String,
  },
  rating: {
    type: String,
  },
 technicalSpecification: {
    type: String,
 },
 tentativeMake:{
    type:String,    
 },
 status:{
    type:String,
 },
 submittedBy:{
    type:String,
 },


},{ timestamps: true });

module.exports = mongoose.model("BOS_Master", bosSchema);
