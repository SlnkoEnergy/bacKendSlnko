const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "projectDetail",
    required: true,
  },
  filename: {
    type: String,
  },
  fileurl: {
    type: String,
  },
  fileType: {
    type: String,
  },
});

module.exports = mongoose.model("Documents", documentSchema);
