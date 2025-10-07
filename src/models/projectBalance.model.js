const { default: mongoose } = require("mongoose");

const projectBalanceSchema = new mongoose.Schema(
  {
    p_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projectDetail",
    },
    project_mw: {
      type: String,
    },
    totalCredited: {
      type: Number,
    },
    totalDebited: {
      type: Number,
    },
    amountAvailable: {
      type: Number,
    },
    balanceSlnko: {
      type: Number,
    },
    balancePayable: {
      type: Number,
    },
    balanceRequired: {
      type: Number,
    },
    totalAdjustment: {
      type: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectBalance", projectBalanceSchema);
