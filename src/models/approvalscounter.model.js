const mongoose = require("mongoose");

const approvalCounterSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  count: { type: Number, default: 0 },
});

module.exports = mongoose.model("ApprovalCounter", approvalCounterSchema);
