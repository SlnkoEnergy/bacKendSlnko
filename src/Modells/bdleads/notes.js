const { default: mongoose } = require("mongoose");

const noteSchema = new mongoose.Schema({
  lead_id: {
    type: mongoose.Schema.Types.ObjectId,
    required:true,
    ref: "bdleads",
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
