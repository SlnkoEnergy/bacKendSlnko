const { default: mongoose } = require("mongoose");
const updateCurrentStatus = require("../../utils/updateCurrentStatus");

const taskSchema = new mongoose.Schema({
  title:{
    type:String,
    required:true
  },
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
  status_history: [{
    status:{
      type:String,
      enum: ["draft","completed", "in progress", "pending"],
    },
    remarks:{
      type:String
    },
    user_id:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"User"
    }
  }],
  current_status:{
    type:String,
    enum: ["draft","completed", "in progress", "pending"],
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

taskSchema.pre("save", function (next) {
  updateCurrentStatus(this, "status_history", "current_status");
  next();
});

module.exports = mongoose.model("BDtask", taskSchema);
