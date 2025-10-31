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
   totalReturn:{
    type:Number
   },
   bill_basic:{
    type:Number
   },
   bill_gst:{
    type:Number
   },
    totalAmountPaidNew:{
      type:Number
    },
    totalSalesValue:{
      type:Number
    },
    totalBilledValue:{
      type:Number
    },
    recentCredits: [
      {
        _id: false,
        cr_date: Date,
        cr_amount: Number,
        added_by: String,
      },
    ],
    recentDebits: [
      {
        _id: false,
        dbt_date: Date,
        amount_paid: Number,
        paid_for: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("projectBalance", projectBalanceSchema);
