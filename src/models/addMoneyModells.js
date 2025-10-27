const { default: mongoose } = require("mongoose");

const moneySchema = new mongoose.Schema(
  {
    p_id: {
      type: Number,
    },
       project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
      index: true,
    },
    comment: {
      type: String,
    },
    submitted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cr_amount: {
      type: Number,
    },
    cr_date: {
      type: Date,
    },
    cr_mode: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("addMoney", moneySchema);
