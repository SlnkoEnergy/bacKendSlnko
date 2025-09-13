const { default: mongoose } = require("mongoose");

const iteamSchema = new mongoose.Schema(
  {
    id: {
      type: String,
    },

    item: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("item", iteamSchema);
