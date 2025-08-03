const payRequestModells = require("../Modells/payRequestModells");
const projectModells = require("../Modells/projectModells");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");
const vendorModells = require("../Modells/vendorModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const { get } = require("mongoose");
const exccelDataModells = require("../Modells/excelDataModells");
const recoverypayrequest = require("../Modells/recoveryPayrequestModells");
const subtractMoneyModells = require("../Modells/debitMoneyModells");

// Request payment

const generateRandomCode = () => Math.floor(100 + Math.random() * 900);
const payRrequest = async (req, res) => {
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
      credit,
      approval_status,
      timers,
      status_history,
      credit_history,
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
      code,
    } = req.body;

    const existingPayment = await payRequestModells.findOne({ pay_id });
    if (existingPayment) {
      return res.status(400).json({
        msg: "Payment ID already used! Please refresh and try again.",
      });
    }

    const project = await projectModells.findOne({
      $or: [{ p_id }, { code }],
    });
    if (!project || !project.code) {
      return res.status(400).json({
        msg: "Invalid or missing project code!",
      });
    }

    const projectCode = project.code;
    let modifiedPId = `${projectCode}/${generateRandomCode()}`;
    let existingPayRequest = await payRequestModells.findOne({
      pay_id: modifiedPId,
    });

    while (existingPayRequest) {
      modifiedPId = `${projectCode}/${generateRandomCode()}`;
      existingPayRequest = await payRequestModells.findOne({
        pay_id: modifiedPId,
      });
    }

    const newPayment = new payRequestModells({
      id,
      p_id,
      pay_id: modifiedPId,
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
      credit: credit || {},
      approval_status: approval_status || {
        stage: credit?.credit_deadline ? "Credit Pending" : "Draft",
        user_id: null,
        remarks: "",
      },
      timers: timers || {
        draft_started_at: new Date(),
        trash_started_at: null,
      },
      status_history: status_history || [
        {
          stage: credit?.credit_deadline ? "Credit Pending" : "Draft",
          remarks: "",
          user_id: null,
        },
      ],
      credit_history: credit_history || [],
    });

    await newPayment.save();

    return res.status(200).json({
      msg: "Payment requested successfully",
      newPayment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Failed to request payment. Please try again.",
      error: error.message,
    });
  }
};

//Hold payment
const holdpay = async function (req, res) {
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

    // const existingPayment = await payRequestModells.findOne({ pay_id: pay_id });
    // if (!existingPayment) {
    //   return res.status(400).json({ msg: "Payment ID already used!" });
    // }

    // Get project details by project ID
    // const project = await projectModells.find({ p_id: p_id });
    // if (!project) {
    //   return res.status(400).json({ msg: "Project ID is invalid!" });
    // }
    const project = await projectModells.findOne({ p_id: p_id });
    if (!project) {
      return res.status(400).json({ msg: "Project ID is invalid!" });
    }

    // if (!project.code) {
    //   return res.status(400).json({ msg: "Project code not found!" });
    // }

    // console.log("Project code:", project.code); // Debugging log

    // Validation: Amount paid should not exceed PO value
    // if (amount_paid > po_balance) {
    //   return res
    //     .status(400)
    //     .json({ msg: "Requested Amount is greater than PO Balance!" });
    // }
    const projectCode = project.code; // Assuming `code` is a field in projectModells

    // Generate random three-digit code
    const randomCode = Math.floor(100 + Math.random() * 900); // Random 3-digit number

    // Append the random code to the project code to form modified p_id
    const modifiedPId = `${projectCode}/${randomCode}`;

    let existingPayRequest = await holdPaymentModells.findOne({
      pay_id: modifiedPId,
    });

    while (existingPayRequest) {
      // If the modifiedPId exists, generate a new one and check again
      modifiedPId = `${projectCode}/${generateRandomCode()}`;
      existingPayRequest = await holdPaymentModells.findOne({
        pay_id: modifiedPId,
      });
    }

    // Validation: Amount paid should not exceed PO balance
    // if (amount_paid > po_balance) {
    //   return res
    //     .status(400)
    //     .json({ msg: "Requested Amount is greater than PO_balance!" });
    // }

    const holdPayment = new holdPaymentModells({
      id,
      p_id,
      pay_id: modifiedPId,
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
    await holdPayment.save();
    return res
      .status(200)
      .json({ msg: "Hold Payment requested successfully", holdPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Failed to request hold payment. Please try again.",
      error: error.message,
    });
  }
};

//get alll pay summary
const getPaySummary = async (req, res) => {
  let request = await payRequestModells.find();
  res.status(200).json({ msg: "all-pay-summary", data: request });
};

//get all hold pay
const hold = async function (req, res) {
  // const page = parseInt(req.query.page) || 1;
  // const pageSize = 200;
  // const skip = (page - 1) * pageSize;

  let data = await holdPaymentModells.find();
  // .sort({ createdAt: -1 }) // Latest first
  // .skip(skip)
  // .limit(pageSize);

  res.status(200).json({ msg: "Hold Payment Status", data });
};

//Account matched
const account_matched = async function (req, res) {
  const { pay_id, acc_number, ifsc, submitted_by } = req.body;
  const accNumberStr = String(acc_number); // Match as string
  const accNumberNum = Number(acc_number); // Match as number (integer or float)
  const accNumberDouble = parseFloat(acc_number); // Ensure floating point match
  try {
    const payment = await payRequestModells.findOneAndUpdate(
      {
        pay_id,
        ifsc,
        $or: [
          { acc_number: accNumberStr }, // Match as string
          { acc_number: accNumberNum }, // Match as number (integer or float)
          { acc_number: accNumberDouble },
        ],
      }, // Matching criteria
      { $set: { acc_match: "matched" } }, // Update action
      { new: true } // Return the updated document
    );

    if (payment) {
      res.status(200).json({
        message: "Account matched successfully!",
        data: payment,
      });

      const newExcelData = new exccelDataModells({
        id: payment.id,
        p_id: payment.p_id,
        pay_id: payment.pay_id,
        pay_type: payment.pay_type,
        amount_paid: payment.amount_paid,
        amt_for_customer: payment.amt_for_customer,
        dbt_date: payment.dbt_date,
        paid_for: payment.paid_for,
        vendor: payment.vendor,
        po_number: payment.po_number,
        po_value: payment.po_value,
        po_balance: payment.po_balance,
        pay_mode: payment.pay_mode,
        paid_to: payment.paid_to,
        ifsc: payment.ifsc,
        benificiary: payment.benificiary,
        acc_number: payment.acc_number,
        branch: payment.branch,
        created_on: payment.created_on,
        submitted_by,
        approved: payment.approved,
        disable: payment.disable,
        acc_match: payment.acc_match,
        utr: payment.utr,
        total_advance_paid: payment.total_advance_paid,
        other: payment.other,
        comment: payment.comment,
        status: "Not-paid",
      });
      await newExcelData.save();
    } else {
      res.status(404).json({
        message: "No matching record found.",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "An error occurred while matching the account.",
    });
  }
};

// account approved
const accApproved = async function (req, res) {
  const { pay_id, status } = req.body;
  if (!pay_id || !status || !["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid pay_id or status" });
  }

  try {
    const payment = await payRequestModells.findOne({
      pay_id,
      approved: "Pending",
    });

    if (!payment) {
      return res.status(404).json({
        message: "No matching record found or record already approved",
      });
    }
    const paidFor = payment.paid_for?.trim();
    const poNumber = payment.po_number?.trim();

    const validatePO =
      status === "Approved" &&
      ((paidFor !== "Customer Adjustment" && paidFor !== "Project Expense") ||
        (paidFor === "Project Expense" && poNumber && poNumber !== "N/A"));

    if (validatePO) {
      const poNumber = payment.po_number;

      const purchaseOrder = await purchaseOrderModells.findOne({
        po_number: poNumber,
      });

      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }

      const approvedPayments = await payRequestModells.find({
        po_number: poNumber,
        approved: "Approved",
      });

      const totalPaid = approvedPayments.reduce(
        (sum, p) => sum + (parseFloat(p.amount_paid) || 0),
        0
      );

      const newTotalPaid = totalPaid + (parseFloat(payment.amount_paid) || 0);

      const poValue = parseFloat(purchaseOrder.po_value) || 0;

      if (newTotalPaid > poValue) {
        return res.status(400).json({
          message: `Approval Denied: The total amount exceeds the PO limit of (₹${poValue.toLocaleString("en-IN")}). Please review and update the PO value before proceeding`,
        });
      }
    }

    payment.approved = status;
    await payment.save();

    return res
      .status(200)
      .json({ message: "Approval status updated", data: payment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

//Update UTR number
const utrUpdate = async function (req, res) {
  const { pay_id, utr, utr_submitted_by } = req.body;
  try {
    // Find the payment record based on pay_id and account match
    const payment = await payRequestModells.findOne({
      pay_id,
      acc_match: "matched",
    });

    if (payment) {
      // Check if the UTR is already set in the payment record
      if (payment.utr) {
        // If UTR is already present, don't update and return a message
        return res.status(400).json({
          message: "UTR number is already present. No update is required.",
          data: payment,
        });
      }

      // If UTR is not already set, proceed with the update
      const updatedPayment = await payRequestModells.findOneAndUpdate(
        { pay_id, acc_match: "matched" },
        { $set: { utr, utr_submitted_by } },
        { new: true }
      );

      if (updatedPayment) {
        // Create and save the subtractMoney document
        let sutractMoney = new subtractMoneyModells({
          p_id: updatedPayment.p_id,
          pay_type: updatedPayment.pay_type,
          amount_paid: updatedPayment.amount_paid,
          amt_for_customer: updatedPayment.amt_for_customer,
          dbt_date: updatedPayment.dbt_date,
          paid_for: updatedPayment.paid_for,
          vendor: updatedPayment.vendor,
          po_number: updatedPayment.po_number,
          utr: updatedPayment.utr,
        });
        await sutractMoney.save();

        res.status(200).json({
          message: "UTR number updated successfully!",
          data: updatedPayment,
          subtractMoney: sutractMoney,
        });
      } else {
        res.status(404).json({
          message: "No matching record found or account not matched.",
        });
      }
    } else {
      res.status(404).json({
        message: "No matching record found or account not matched.",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "An error occurred while updating the UTR number.",
    });
  }
};

//new-appov-account
const newAppovAccount = async function (req, res) {
  const { pay_id, status } = req.body;
  const isValidRequest = (pay_id, status) =>
    pay_id && status && ["Approved", "Rejected"].includes(status);

  if (!isValidRequest(pay_id, status)) {
    return res.status(400).json({ message: "Invalid p_id or status" });
  }
  try {
    // Fetch the payment with the provided pay_id and 'Pending' approval status
    const payment = await payRequestModells.findOne({
      pay_id,
      approved: "Pending",
    });

    // Early return if no matching record is found
    if (!payment) {
      return res.status(404).json({ message: " record already approved" });
    }

    // Update approval status
    payment.approved = status;

    // Save the updated payment request
    await payment.save();

    // Send a success response with the updated payment
    return res
      .status(200)
      .json({ message: "Approval status updated", data: payment });
  } catch (error) {
    console.error("Error updating payment approval status:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

//detete payment request by ID
const deletePayRequestById = async function (req, res) {
  try {
    const { _id } = req.params;
    const deleted = await payRequestModells.findByIdAndDelete(_id);
    if (!deleted) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json({
      message: "Item deleted successfully",
      item: deleted,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting item: " + error });
  }
};

// Move payment request to recovery collection
const restorepayrequest = async function (req, res) {
  const { _id } = req.params._id;
  try {
    const data = await payRequestModells.findOneAndReplace(_id);

    if (!data) {
      return res.status(404).json({ msg: "User Not fornd" });
    }
    const recoveryItem = new recoverypayrequest({
      id: data.id,
      p_id: data.p_id,
      pay_id: data.pay_id,
      pay_type: data.pay_type,
      amount_paid: data.amount_paid,
      amt_for_customer: data.amt_for_customer,
      dbt_date: data.dbt_date,
      paid_for: data.paid_for,
      vendor: data.vendor,
      po_number: data.po_number,
      po_value: data.po_value,
      po_balance: data.po_balance,
      pay_mode: data.pay_mode,
      paid_to: data.paid_to,
      ifsc: data.ifsc,
      benificiary: data.benificiary,
      acc_number: data.acc_number,
      branch: data.branch,
      created_on: data.created_on,
      submitted_by: data.submitted_by,
      approved: data.approved,
      disable: data.disable,
      acc_match: data.acc_match,
      utr: data.utr,
      total_advance_paid: data.total_advance_paid,
      other: data.other,
      comment: data.comment,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      created_on: data.created_on,
    });
    await recoveryItem.save();
    await payRequestModells.deleteOne(_id);

    res.json({
      message: "Item moved to recovery collection successfully",
      item: recoveryItem,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting item" + error });
  }
};

// Edit payment request by ID
const editPayRequestById = async function (req, res) {
  try {
    const { _id } = req.params;
    const data = req.body;
    const updated = await payRequestModells.findByIdAndUpdate(_id, data, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json({
      message: "Item updated successfully",
      item: updated,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating item: " + error });
  }
};

// Get payment request by ID
const getPayRequestById = async function (req, res) {
  try {
    const { _id } = req.params;
    const data = await payRequestModells.findById(_id);

    if (!data) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json({
      message: "Item found",
      item: data,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching item: " + error });
  }
};

//get exceldaTa
const excelData = async function (req, res) {
  // const page = parseInt(req.query.page) || 1;
  // const pageSize = 200;
  // const skip = (page - 1) * pageSize;

  let data = await exccelDataModells.find();
  // .sort({ createdAt: -1 }) // Latest first
  // .skip(skip)
  // .limit(pageSize);

  res.status(200).json({ msg: "All Excel Data", data: data });
};

//update excel data
const updateExcelData = async function (req, res) {
  try {
    const status = req.body;

    // Perform update operation
    const result = await exccelDataModells.updateMany(
      { status, status: "Not-paid" }, // Query for documents with status "Not-paid"
      { $set: { status: "Deleted" } } // Update the status to "Deleted"
    );

    // Check if any documents were updated
    if (result.modifiedCount > 0) {
      // Return success response with the number of modified documents
      res.json({
        message: "Deleted successfully",
        modifiedCount: result.modifiedCount,
      });
    } else {
      res.json({
        message: "No matching documents found to update. +",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "An error occurred while updating the item status.",
    });
  }
};

//
const updateExceData = async function (req, res) {
  try {
    const { _id } = req.body; // Extract _id from request body

    if (!_id) {
      return res.status(400).json({ message: "ID is required." });
    }

    // Find the document by _id
    const document = await exccelDataModells.findOne({ _id });

    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    if (document.status !== "Not-paid") {
      return res
        .status(400)
        .json({ message: "Status is not 'Not-paid', update not allowed." });
    }

    // Perform update operation
    const result = await exccelDataModells.updateOne(
      { _id, status: "Not-paid" },
      { $set: { status: "Deleted" } }
    );

    if (result.modifiedCount > 0) {
      res.json({ message: "Status Changed to Deleted successfully" });
    } else {
      res.json({ message: "No changes made." });
    }
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred while updating the item status." });
  }
};

// Get Excel data by id

const getExcelDataById = async function (req, res) {
  try {
    const { _id } = req.params;

    const data = await exccelDataModells.findById(_id);

    if (!data) {
      return res.status(404).json({ message: "Data not found" });
    }

    res.json({ message: "Data found", data });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching data" });
  }
};

//get-all-payRequest
const getPay = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const skip = (page - 1) * pageSize;
    const query = req.query.query?.trim() || "";

    const searchRegex = new RegExp(query, "i");

    const lookupStage = {
      $lookup: {
        from: "projectdetails",
        localField: "p_id",
        foreignField: "p_id",
        as: "project",
      },
    };
    const paginatedPipeline = [
      lookupStage,
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      ...(query
        ? [
            {
              $match: {
                $or: [
                  { pay_id: { $regex: searchRegex } },
                  { paid_for: { $regex: searchRegex } },
                  { approved: { $regex: searchRegex } },
                  { vendor: { $regex: searchRegex } },
                  { utr: { $regex: searchRegex } },
                  { "project.customer": { $regex: searchRegex } },
                ],
              },
            },
          ]
        : []),

      {
        $addFields: {
          customer_name: "$project.customer",
        },
      },

      {
        $project: { project: 0 },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
    ];

    const countPipeline = [
      lookupStage,
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      ...(query
        ? [
            {
              $match: {
                $or: [
                  { pay_id: { $regex: searchRegex } },
                  { paid_for: { $regex: searchRegex } },
                  { vendor: { $regex: searchRegex } },
                  { approved: { $regex: searchRegex } },
                  { utr: { $regex: searchRegex } },
                  { po_number: { $regex: searchRegex } },
                  { "project.customer": { $regex: searchRegex } },
                ],
              },
            },
          ]
        : []),

      { $count: "total" },
    ];

    const [request, totalArr] = await Promise.all([
      payRequestModells.aggregate(paginatedPipeline),
      payRequestModells.aggregate(countPipeline),
    ]);

    const total = totalArr[0]?.total || 0;

    res.status(200).json({
      msg: "all-pay-summary",
      meta: {
        total,
        page,
        count: request.length,
      },
      data: request,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error retrieving data", error: err.message });
  }
};

//Acount Approved is = pending data save to hold payment
const approve_pending = async function (req, res) {
  try {
    const { pay_id, approved } = req.body;
    const data = await payRequestModells.findOne({
      pay_id: pay_id,
      approved: "Pending",
    });
    if (!data) {
      return res
        .status(404)
        .json({ message: "No pending payment request found." });
    }
    if (data) {
      const newData = new holdPaymentModells({
        id: data.id,
        p_id: data.p_id,
        pay_id: data.pay_id,
        pay_type: data.pay_type,
        amount_paid: data.amount_paid,
        amt_for_customer: data.amt_for_customer,
        dbt_date: data.dbt_date,
        paid_for: data.paid_for,
        vendor: data.vendor,
        po_number: data.po_number,
        po_value: data.po_value,
        po_balance: data.po_balance,
        pay_mode: data.pay_mode,
        paid_to: data.paid_to,
        ifsc: data.ifsc,
        benificiary: data.benificiary,
        acc_number: data.acc_number,
        branch: data.branch,
        created_on: data.created_on,
        submitted_by: data.submitted_by,
        approved: data.approved,
        disable: data.disable,
        acc_match: data.acc_match,
        utr: data.utr,
        total_advance_paid: data.total_advance_paid,
        other: data.other,
        comment: data.comment,
      });
      await payRequestModells.deleteOne({
        pay_id: pay_id,
        approved: "Pending",
      });

      await newData.save();

      res
        .status(200)
        .json({ message: "Data saved to hold payment", data: newData });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting item" + error });
  }
};

//hold pay approved data to payrequest

const hold_approve_pending = async function (req, res) {
  try {
    const { pay_id, approved } = req.body;
    const data = await holdPaymentModells.findOne({
      pay_id: pay_id,
      approved: "Pending",
    });
    if (!data) {
      return res
        .status(404)
        .json({ message: "No pending payment request found." });
    }
    if (data) {
      const newData = new payRequestModells({
        id: data.id,
        p_id: data.p_id,
        pay_id: data.pay_id,
        pay_type: data.pay_type,
        amount_paid: data.amount_paid,
        amt_for_customer: data.amt_for_customer,
        dbt_date: data.dbt_date,
        paid_for: data.paid_for,
        vendor: data.vendor,
        po_number: data.po_number,
        po_value: data.po_value,
        po_balance: data.po_balance,
        pay_mode: data.pay_mode,
        paid_to: data.paid_to,
        ifsc: data.ifsc,
        benificiary: data.benificiary,
        acc_number: data.acc_number,
        branch: data.branch,
        created_on: data.created_on,
        submitted_by: data.submitted_by,
        approved: data.approved,
        disable: data.disable,
        acc_match: data.acc_match,
        utr: data.utr,
        total_advance_paid: data.total_advance_paid,
        other: data.other,
        comment: data.comment,
      });
      await holdPaymentModells.deleteOne({
        pay_id: pay_id,
        approved: "Pending",
      });

      await newData.save();

      res
        .status(200)
        .json({ message: "Data saved to pay Request", data: newData });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting item" + error });
  }
};

const getpy = async function (req, res) {
  const data = await payRequestModells.find();
  res.status(200).json({ msg: "All pay request", data: data });
};

module.exports = {
  payRrequest,
  holdpay,
  getPaySummary,
  hold,
  account_matched,
  utrUpdate,
  accApproved,
  // getVendorById,
  newAppovAccount,
  deletePayRequestById,
  editPayRequestById,
  getPayRequestById,
  excelData,
  updateExcelData,
  restorepayrequest,
  getPay,
  approve_pending,
  hold_approve_pending,
  updateExceData,
  getExcelDataById,
  getpy,
};
