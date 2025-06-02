const subtractModells = require("../Modells/debitMoneyModells");
const payrequestModells = require("../Modells/payRequestModells");
const recoverydebitModells = require("../Modells/recoveryDebitHistoryModells");

const subtractmoney = async function (req, res) {
  try {
    const {
      id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment,
    } = req.body;

    // Validate if UTR is provided
    if (!utr || utr === 0 || utr === "0") {
      return res
        .status(400)
        .json({ msg: "UTR is missing. Please provide a valid UTR." });
    }

    // Check if UTR already exists in payrequestModells
    const existingutr = await payrequestModells.findOne({
      utr: { $ne: " " || 0 || "0" },
    });

    if (existingutr) {
      const subtractMoney = new subtractModells({
        id,
        p_id,
        pay_id,
        pay_type,
        amount_paid,
        amt_for_customer,
        dbt_date,
        paid_for,
        vendor,
        po_number,
        po_value,
        po_balance,
        pay_mode,
        paid_to,
        ifsc,
        benificiary,
        acc_number,
        branch,
        created_on,
        submitted_by,
        approved,
        disable,
        acc_match,
        utr,
        total_advance_paid,
        other,
        comment,
      });

      // Save to the database
      let data = await subtractMoney.save();
      return res.status(200).json({
        msg: "Debited amount successfully saved",
        data: data,
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      msg: "Failed to save debited amount. Please try again.",
      error: error.message,
    });
  }
};

//get subtract money
const getsubtractMoney = async function (req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const limit = 10; 
    const skip = (page - 1) * pageSize;
    const data = await subtractModells
      .find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    return res.status(200).json({
      msg: "Debited amount fetched successfully",
      data: data,
    });
  } catch (error) {
    return res.status(500).json({
      msg: "Failed to fetch debited amount. Please try again.",
      error: error.message,
    });
  }
};

//detete debit money
const deleteDebitMoney = async function (req, res) {
  const { _id } = req.params;

  try {
    // Use MongoDB's updateOne with $unset to remove fields
    const updatedDoc = await subtractModells.updateOne(
      { _id: _id }, // Find document by ID
      {
        $unset: {
          dbt_date: "",
          pay_mode: "",
          paid_for: "",
          amount_paid: "",
          utr: "",
          vendor: "",
        },
      }
    );

    if (updatedDoc.nModified === 0) {
      return res
        .status(404)
        .json({ message: "Document not found or no changes made." });
    }

    return res
      .status(200)
      .json({ message: "Debit amount deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const recoveryDebit = async function (req, res) {
  const { id } = req.params._id;

  try {
    // const data = await subtractModells.findOneAndReplace({id});
    // if (!data) {
    //   res.status(404).json({ msg: "User Not fornd" });
    // }

    const data = await subtractModells.findOne({ _id: id });
    if (!data) {
      return res.status(404).json({ msg: "User Not found" });
    }

    const recoverydebit = new recoverydebitModells({
      p_id: data.p_id,
      p_group: data.p_group,
      pay_type: data.pay_type,
      amount_paid: data.amount_paid,
      amt_for_customer: data.amt_for_customer,
      dbt_date: data.dbt_date,
      paid_for: data.paid_for,
      other: data.other,
      vendor: data.vendor,
      po_number: data.po_number,
      pay_mode: data.pay_mode,
      dbt_acc_number: data.dbt_acc_number,
      cr_acc_number: data.cr_acc_number,
      utr: data.utr,
      trans_details: data.trans_details,
      submitted_by: data.submitted_by,
      t_id: data.t_id,
    });
    let recoverydebitdata = await recoverydebit.save();
    await subtractModells.deleteOne({ _id: id });

    res
      .status(200)
      .json({
        msg: "Debit amount recovery successfully",
        data: recoverydebitdata,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        msg: "An error occurred while recovery debit history",
        error: error.message,
      });
  }
};

const deleteSubtractMoney = async function (req, res) {
  try {
    const { _id } = req.params;

    const data = await subtractModells.findByIdAndDelete({ _id });

    if (!data) {
      return res.status(404).json({ msg: "Data not found" });
    }

    return res
      .status(200)
      .json({ msg: "Debit amount deleted successfully", data: data });
  } catch (error) {
    return res
      .status(500)
      .json({
        msg: "An error occurred while deleting debit amount",
        error: error.message,
      });
  }
};

module.exports = {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney,
  recoveryDebit,
  deleteSubtractMoney,
};
