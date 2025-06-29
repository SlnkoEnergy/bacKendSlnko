const { default: mongoose } = require("mongoose");

const noteSchema = new mongoose.Schema({
  lead_id: {
    type: mongoose.Schema.Types.ObjectId,
    required:true,
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
  description: {
    type: String,
  },
},{timestamps:true});

module.exports = mongoose.model("BDnotes", noteSchema);
