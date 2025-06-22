const { default: mongoose } = require("mongoose");

const taskSchema = new mongoose.Schema({
  lead_id: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "lead_model",
  },
  lead_model: {
    type: String,
    enum: ["Initial", "Followup", "Warm", "Won", "Dead"],
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  type: {
    type: String,
    enum: ["meeting", "call", "sms", "email", "todo"],
  },
  status: {
    type: String,
    enum: ["completed", "in progress", "pending"],
  },
  priority:{
    type:String,
    enum:["high", "medium", "low"]
  },
  assigned_to: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  deadline:{
    type:Date,
    required:true
  },
  contact_info:{
    type:String
  },
  description: {
    type: String,
  },
},{timestamps:true});

module.exports = mongoose.model("BDtask", taskSchema);
