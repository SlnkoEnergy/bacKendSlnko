const payRequestModells = require("../Modells/payRequestModells");
const projectModells = require("../Modells/projectModells");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");
const vendorModells = require("../Modells/vendorModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const { get, default: mongoose } = require("mongoose");
const exccelDataModells = require("../Modells/excelDataModells");
const recoverypayrequest = require("../Modells/recoveryPayrequestModells");
const subtractMoneyModells = require("../Modells/debitMoneyModells");
const materialCategoryModells = require("../Modells/EngineeringModells/materials/materialCategoryModells");
const userModells = require("../Modells/users/userModells");
const utrCounter = require("../Modells/Globals/utrCounter");

// Request payment

const generateRandomCode = () => Math.floor(100 + Math.random() * 900);
const generateRandomCreditCode = () => Math.floor(1000 + Math.random() * 9000);

const payRrequest = async (req, res) => {
  try {
    const userId = req.user?.userId || null;
    const {
      p_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      credit,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      acc_match,
      utr,
      other,
      comment,
      code,
    } = req.body;

    // ✅ validate project
    const project = await projectModells.findOne({ $or: [{ p_id }, { code }] });
    if (!project?.code)
      return res.status(400).json({ msg: "Invalid or missing project code!" });

    let pay_id = null;
    let cr_id = null;

    // ✅ credit case
    if (credit?.credit_status === true) {
      if (!credit.credit_deadline)
        return res.status(400).json({ msg: "Credit deadline is required." });

      const dbtDateObj = new Date(dbt_date);
      const deadlineDateObj = new Date(credit.credit_deadline);
      const diffDays = Math.floor(
        (deadlineDateObj - dbtDateObj) / (1000 * 60 * 60 * 24)
      );

      if (diffDays < 2) {
        return res.status(400).json({
          msg: "Credit deadline must be at least 2 days after the debit date.",
        });
      }

      do {
        cr_id = `${project.code}/${generateRandomCreditCode()}/CR`;
      } while (await payRequestModells.findOne({ cr_id }));
    } else {
      do {
        pay_id = `${project.code}/${generateRandomCode()}`;
      } while (await payRequestModells.findOne({ pay_id }));
    }

    const initialStage = credit?.credit_status ? "Credit Pending" : "Draft";

    const newPayment = new payRequestModells({
      p_id,
      pay_id,
      cr_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      acc_match,
      utr,
      other,
      comment,
      credit: {
        credit_deadline: credit?.credit_deadline || null,
        credit_status: !!credit?.credit_status,
        credit_extension: credit?.credit_extension,
        credit_remarks: credit?.credit_remarks || "",
        user_id: userId,
      },
      approval_status: {
        stage: initialStage,
        user_id: userId,
        remarks: "",
      },
      timers: {
        draft_started_at: new Date(),
        draft_frozen_at: null,
        trash_started_at: null,
      },
      status_history: [
        {
          stage: initialStage,
          remarks: "",
          user_id: userId,
          timestamp: new Date(),
        },
      ],
      // ✅ credit history
      credit_history: credit?.credit_status
        ? [
            {
              status: "Created",
              credit_deadline: credit.credit_deadline,
              credit_remarks: credit.credit_remarks || "",
              user_id: userId,
              timestamp: new Date(),
            },
          ]
        : [],
      // ✅ utr history (only if utr is provided initially)
      utr_history: utr
        ? [
            {
              utr,
              status: "Created",
              user_id: userId,
              timestamp: new Date(),
            },
          ]
        : [],
    });

    await newPayment.save();
    return res
      .status(200)
      .json({ msg: "Payment requested successfully", newPayment });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ msg: "Failed to request payment", error: error.message });
  }
};

const deadlineExtendRequest = async (req, res) => {
  const { _id } = req.params;
  const { credit_deadline, credit_remarks } = req.body;

  if (!credit_deadline || !credit_remarks) {
    return res.status(400).json({ msg: "All fields are required" });
  }

  try {
    const payment = await payRequestModells.findById(_id);
    if (!payment) {
      return res.status(404).json({ msg: "Payment request not found" });
    }

    if (!payment.cr_id) {
      return res.status(400).json({ msg: "Payment Credit Id not found" });
    }

    const [day, month, year] = credit_deadline.split("/");
    const parsedDate = new Date(`${year}-${month}-${day}`);

    if (isNaN(parsedDate)) {
      return res
        .status(400)
        .json({ msg: "Invalid date format for credit_deadline" });
    }

    payment.credit.credit_deadline = parsedDate;
    payment.credit.credit_remarks = credit_remarks;

    payment.credit.credit_extension = false;

    payment.credit_history.push({
      status: "Updated",
      credit_deadline: parsedDate,
      credit_remarks,
      user_id: req.user.userId,
      timestamp: new Date(),
    });

    await payment.save();

    return res
      .status(200)
      .json({ msg: "Credit deadline extended successfully", data: payment });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ msg: "Failed to extend credit deadline", error: error.message });
  }
};

const requestCreditExtension = async (req, res) => {
  const { _id } = req.params;

  try {
    const payment = await payRequestModells.findById(_id);
    if (!payment) {
      return res.status(404).json({ msg: "Payment request not found" });
    }

    payment.credit.credit_extension = true;
    payment.credit.user_id = req.user.userId;

    await payment.save();
    res.status(200).json({ msg: "Credit extension requested", data: payment });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Error requesting credit extension", error: error.message });
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

const accApproved = async function (req, res) {
  try {
    const { _id, status, remarks } = req.body;

    const ACTIONS = ["Approved", "Rejected", "Pending"];
    if (!_id || !status || !ACTIONS.includes(status)) {
      return res.status(400).json({ message: "status must be Approved or Rejected" });
    }
    if (status === "Rejected" && !remarks?.trim()) {
      return res.status(400).json({ message: "Remarks are required when status is Rejected" });
    }

    const currentUser = await userModells.findById(req.user.userId).lean();
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { department, role, _id: actorId } = currentUser;
    if (role !== "manager") {
      return res.status(403).json({ message: "Only managers can approve or reject" });
    }

    const ids = Array.isArray(_id) ? _id : [_id];
    const results = [];

    const pushHistory = (paymentDoc, { stage, statusValue, remarksValue }) => {
      if (!Array.isArray(paymentDoc.status_history)) paymentDoc.status_history = [];
      paymentDoc.status_history.push({
        stage,
        user_id: actorId,
        department,
        role,
        remarks: remarksValue || "",
        status: statusValue,
        timestamp: new Date(),
      });
    };

    const computeTransition = (currentStage) => {
      if ((currentStage === "Draft" || currentStage === "Credit Pending") && department === "SCM")
        return { nextStage: "CAM", approvedValue: "Pending" };
      if (currentStage === "CAM" && department === "Internal")
        return { nextStage: "Account", approvedValue: "Pending" };
      if (currentStage === "Account" && department === "Accounts")
        return { nextStage: "Initial Account", approvedValue: "Pending" };
      if (currentStage === "Initial Account" && department === "Accounts")
        return { nextStage: "Final", approvedValue: "Approved" };
      return null;
    };

    for (const id of ids) {
      try {
        if (!mongoose.isValidObjectId(id)) {
          results.push({ _id: id, status: "error", message: "Invalid payment id" });
          continue;
        }

        const payment = await payRequestModells.findById(id);
        if (!payment) {
          results.push({ _id: id, status: "error", message: "Payment not found" });
          continue;
        }

        const currentStage = payment.approval_status?.stage || "Draft";

        // Already terminal states
        if (payment.approved === "Approved") {
          results.push({ _id: id, status: "error", message: "Already fully approved" });
          continue;
        }
        if (payment.approved === "Rejected") {
          results.push({ _id: id, status: "error", message: "Already rejected" });
          continue;
        }

        // Handle explicit rejection
        if (status === "Rejected") {
          payment.approved = "Rejected";
          payment.approval_status = { stage: currentStage, user_id: actorId, remarks: remarks || "" };
          pushHistory(payment, { stage: currentStage, statusValue: "Rejected", remarksValue: remarks });
          await payment.save();
          results.push({ _id: id, status: "success", message: "Payment rejected successfully" });
          continue;
        }

        // ---------- SCM stage: PO/value validations ----------
        if (department === "SCM") {
          const paidFor = payment.paid_for?.trim();
          const poNumber = payment.po_number?.trim();
          const isMaterialCategory = paidFor
            ? await materialCategoryModells.exists({ name: paidFor })
            : false;

          if (isMaterialCategory) {
            if (!poNumber || poNumber.toUpperCase() === "N/A") {
              results.push({
                _id: id,
                status: "error",
                message: "PO number is required for Material Category based payments.",
              });
              continue;
            }

            const purchaseOrder = await purchaseOrderModells.findOne({ po_number: poNumber }).lean();
            if (!purchaseOrder) {
              results.push({ _id: id, status: "error", message: "Purchase order not found" });
              continue;
            }

            const approvedPayments = await payRequestModells
              .find({ po_number: poNumber, approved: "Approved" })
              .lean();

            const approvedSum = approvedPayments.reduce(
              (sum, p) => sum + (Number(p.amount_paid) || 0),
              0
            );
            const newTotal = approvedSum + (Number(payment.amount_paid) || 0);
            const poValue = Number(purchaseOrder.po_value) || 0;

            if (newTotal > poValue) {
              results.push({
                _id: id,
                status: "error",
                message: `Approval denied: total payments (₹${newTotal.toLocaleString(
                  "en-IN"
                )}) exceed PO value (₹${poValue.toLocaleString("en-IN")}).`,
              });
              continue;
            }
          }
        }

        // ---------- transition decision ----------
        const transition = computeTransition(currentStage);
        if (!transition) {
          results.push({
            _id: id,
            status: "error",
            message: "Invalid approval stage or department for this action.",
          });
          continue;
        }

        const { nextStage, approvedValue } = transition;

        // ---------- Initial Account: gated UTR generation ----------
        let generatedUtr = null;
        if (nextStage === "Initial Account") {
          const projectIdNum = Number(payment?.p_id);
          if (!Number.isFinite(projectIdNum)) {
            results.push({
              _id: id,
              status: "error",
              message: "Numeric project_id (p_id) required for UTR counter",
            });
            continue;
          }

          const isCRFlow = typeof payment.cr_id === "string" && payment.cr_id.trim().length > 0;
          const isPayIdFlow = typeof payment.pay_id === "string" && payment.pay_id.trim().length > 0;

          if (!isCRFlow) {
            if (isPayIdFlow && payment.acc_match !== "matched") {
              results.push({
                _id: id,
                status: "error",
                message: "Account verification is missing for pay_id flow. Please match account before Account approval.",
              });
              continue;
            }
            if (!isPayIdFlow) {
              results.push({
                _id: id,
                status: "error",
                message: "Neither CR flow nor verified pay_id flow. Cannot generate UTR.",
              });
              continue;
            }
          }

          if (!payment.utr) {
            const counter = await utrCounter.findOneAndUpdate(
              { p_id: projectIdNum },
              { $inc: { count: 1, lastDigit: 1 }, $setOnInsert: { p_id: projectIdNum } },
              { new: true, upsert: true }
            );

            generatedUtr = `CR/${projectIdNum}/${String(counter.lastDigit).padStart(2, "0")}`;
            payment.utr = generatedUtr;

            try {
              await subtractMoneyModells.create({
                p_id: projectIdNum,
                pay_id: payment._id,
                pay_type: payment.pay_type,
                amount_paid: payment.amount_paid,
                amt_for_customer: payment.amt_for_customer,
                dbt_date: payment.dbt_date,
                paid_for: payment.paid_for,
                vendor: payment.vendor,
                po_number: payment.po_number,
                utr: generatedUtr,
                submitted_by: actorId,
              });
            } catch (e) {
              results.push({
                _id: id,
                status: "warning",
                message: `UTR saved; subtractMoney failed: ${e.message}`,
              });
            }
          } else {
            generatedUtr = payment.utr; // reuse existing UTR
          }
        }

        // ---------- Final stage: stamp timer once ----------
        if (nextStage === "Final") {
          payment.timers = payment.timers || {};
          if (!payment.timers.draft_frozen_at) {
            payment.timers.draft_frozen_at = new Date();
          }
        }

        // ---------- persist state & history ----------
        payment.approved = approvedValue;
        payment.approval_status = { stage: nextStage, user_id: actorId, remarks: remarks || "" };
        pushHistory(payment, { stage: nextStage, statusValue: approvedValue, remarksValue: remarks });
        await payment.save();

        results.push({
          _id: id,
          status: "success",
          message: "Approval updated successfully",
          ...(generatedUtr ? { utr: generatedUtr } : {}),
          nextStage,
          approved: approvedValue,
        });
      } catch (errPerItem) {
        results.push({
          _id: id,
          status: "error",
          message: errPerItem?.message || "Unknown error processing this id",
        });
      }
    }

    return res.status(200).json({ message: "Processed approval updates", results });
  } catch (error) {
    console.error("Error in accApproved:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const utrUpdate = async function (req, res) {
  const { pay_id, cr_id, utr } = req.body;

  if (!utr || typeof utr !== "string" || !utr.trim()) {
    return res.status(400).json({ message: "Valid UTR is required." });
  }

  try {
    if (pay_id) {
      const payment = await payRequestModells.findOne({
        pay_id,
        acc_match: "matched",
      });

      if (!payment) {
        return res.status(404).json({
          message: "No matching record found or account not matched.",
        });
      }

      if (payment.utr) {
        return res.status(400).json({
          message: "UTR number is already present. No update is required.",
          data: payment,
        });
      }

      const updatedPayment = await payRequestModells.findOneAndUpdate(
        { pay_id, acc_match: "matched" },
        { $set: { utr: utr.trim() } },
        { new: true }
      );

      if (!updatedPayment) {
        return res.status(404).json({
          message: "No matching record found or account not matched.",
        });
      }

      const sutractMoney = new subtractMoneyModells({
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

      return res.status(200).json({
        message: "UTR number updated successfully!",
        data: updatedPayment,
        subtractMoney: sutractMoney,
      });
    }

    if (cr_id) {
      const payment = await payRequestModells.findOne({
        cr_id,
        "approval_status.stage": "Initial Account",
      });

      if (!payment) {
        return res.status(404).json({
          message:
            "No matching record found with this CR ID at stage 'Initial Account'.",
        });
      }

      if (payment.utr) {
        return res.status(400).json({
          message: "UTR number is already present. No update is required.",
          data: payment,
        });
      }

      const updatedPayment = await payRequestModells.findOneAndUpdate(
        {
          cr_id,
          "approval_status.stage": "Initial Account",
          utr: { $exists: false },
        },
        { $set: { utr: utr.trim() } },
        { new: true }
      );

      if (!updatedPayment) {
        return res.status(404).json({
          message:
            "No matching record found or UTR already exists for this CR ID.",
        });
      }

      const sutractMoney = new subtractMoneyModells({
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

      return res.status(200).json({
        message: "UTR number updated successfully by CR ID!",
        data: updatedPayment,
        subtractMoney: sutractMoney,
      });
    }

    return res.status(400).json({
      message:
        "Provide either pay_id (with acc_match) or cr_id (at 'Initial Account' stage).",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "An error occurred while updating the UTR number.",
    });
  }
};

const restoreTrashToDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body;
    const user_id = req.user.userId;

    if (!remarks || typeof remarks !== "string" || remarks.trim() === "") {
      return res
        .status(400)
        .json({ message: "Remarks are required for this action" });
    }

    if (!["restore", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ message: "Invalid action. Must be 'restore' or 'reject'" });
    }

    const request = await payRequestModells.findById(id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.approval_status.stage !== "Trash Pending") {
      return res
        .status(400)
        .json({ message: "Request is not in Trash Pending stage" });
    }

    if (action === "restore") {
      request.approval_status = {
        stage: "SCM",
        user_id,
        remarks,
      };

      request.status_history.push({
        stage: "SCM",
        user_id,
        remarks,
      });

      request.timers.trash_started_at = null;
      request.timers.draft_started_at = new Date();
    } else if (action === "reject") {
      request.approval_status = {
        stage: "Rejected",
        user_id,
        remarks,
      };

      request.status_history.push({
        stage: "Rejected",
        user_id,
        remarks,
      });

      request.timers.trash_started_at = null;
    }

    await request.save();

    return res.status(200).json({
      message: `Request successfully moved to ${request.approval_status.stage}`,
      data: request,
    });
  } catch (error) {
    console.error("Error in restoring from trash:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



const newAppovAccount = async function (req, res) {
  const { pay_id, status } = req.body;
  const isValidRequest = (pay_id, status) =>
    pay_id && status && ["Approved", "Rejected"].includes(status);

  if (!isValidRequest(pay_id, status)) {
    return res.status(400).json({ message: "Invalid p_id or status" });
  }
  try {
    const payment = await payRequestModells.findOne({
      pay_id,
      approved: "Pending",
    });

    if (!payment) {
      return res.status(404).json({ message: " record already approved" });
    }

    payment.approved = status;

    await payment.save();

    return res
      .status(200)
      .json({ message: "Approval status updated", data: payment });
  } catch (error) {
    console.error("Error updating payment approval status:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

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
    const { _id, po_number } = req.query;

    let data;

    if (_id) {
      data = await payRequestModells.findById(_id);
    } else if (po_number) {
      data = await payRequestModells.findOne({ po_number });
    } else {
      return res.status(400).json({ message: "Invalid Id or Po Number" });
    }

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
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim();
    const tab = req.query.tab?.trim();

    const searchRegex = new RegExp(search, "i");
    const statusRegex = new RegExp(`^${status}$`, "i");

    // Lookup project details
    const lookupStage = {
      $lookup: {
        from: "projectdetails",
        localField: "p_id",
        foreignField: "p_id",
        as: "project",
      },
    };
    const unwindStage = {
      $unwind: { path: "$project", preserveNullAndEmptyArrays: true },
    };

    // Build base match conditions
    const matchConditions = [];
    if (search) {
      matchConditions.push({
        $or: [
          { pay_id: { $regex: searchRegex } },
          { cr_id: { $regex: searchRegex } },
          { paid_for: { $regex: searchRegex } },
          { po_number: { $regex: searchRegex } },
          { vendor: { $regex: searchRegex } },
          { utr: { $regex: searchRegex } },
          { "project.customer": { $regex: searchRegex } },
        ],
      });
    }

    // --- NEW LOGIC FOR INSTANT TAB ---
    if (tab === "instant") {
      // Exclude Trash Pending stage, show all approved statuses
      matchConditions.push({
        "approval_status.stage": { $ne: "Trash Pending" },
      });
    } else if (status) {
      // For other tabs, filter by approved status if provided
      matchConditions.push({ approved: status });
    }

    const baseMatch = matchConditions.length ? { $and: matchConditions } : {};

    // Base aggregation pipeline
    const basePipeline = [
      lookupStage,
      unwindStage,
      ...(Object.keys(baseMatch).length ? [{ $match: baseMatch }] : []),
      {
        $addFields: {
          customer_name: "$project.customer",
          type: {
            $switch: {
              branches: [
                { case: { $ifNull: ["$pay_id", false] }, then: "instant" },
                {
                  case: {
                    $and: [
                      { $eq: ["$credit.credit_status", true] },
                      { $ifNull: ["$cr_id", false] },
                    ],
                  },
                  then: "credit",
                },
              ],
              default: "instant",
            },
          },
        },
      },
    ];

    // Tab filtering
    const tabMatchStage = tab ? [{ $match: { type: tab } }] : [];

    // Calculate remaining days
    const remainingDaysStage = [
      {
        $addFields: {
          remaining_days: {
            $cond: [
              { $eq: ["$type", "credit"] },
              {
                $floor: {
                  $divide: [
                    {
                      $subtract: [
                        { $toDate: "$credit.credit_deadline" },
                        "$$NOW",
                      ],
                    },
                    1000 * 60 * 60 * 24,
                  ],
                },
              },
              {
                $cond: [
                  { $eq: ["$approval_status.stage", "Trash Pending"] },
                  {
                    $floor: {
                      $divide: [
                        {
                          $subtract: [
                            {
                              $add: [
                                "$timers.trash_started_at",
                                1000 * 60 * 60 * 24 * 15,
                              ],
                            },
                            "$$NOW",
                          ],
                        },
                        1000 * 60 * 60 * 24,
                      ],
                    },
                  },
                  null,
                ],
              },
            ],
          },
        },
      },
    ];

    // Fetch paginated data
    const [paginatedData, totalData] = await Promise.all([
      payRequestModells.aggregate([
        ...basePipeline,
        ...tabMatchStage,
        ...remainingDaysStage,
        { $project: { project: 0 } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
      ]),
      payRequestModells.aggregate([
        ...basePipeline,
        ...tabMatchStage,
        { $count: "total" },
      ]),
    ]);

    // Tab-wise counts
    const tabWiseCounts = await payRequestModells.aggregate([
      lookupStage,
      unwindStage,
      {
        $addFields: {
          type: {
            $switch: {
              branches: [
                { case: { $ifNull: ["$pay_id", false] }, then: "instant" },
                {
                  case: {
                    $and: [
                      { $eq: ["$credit.credit_status", true] },
                      { $ifNull: ["$cr_id", false] },
                    ],
                  },
                  then: "credit",
                },
              ],
              default: "instant",
            },
          },
        },
      },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    const counts = { instant: 0, credit: 0 };
    tabWiseCounts.forEach((item) => {
      counts[item._id] = item.count;
    });

    res.status(200).json({
      msg: "pay-summary",
      meta: {
        total: totalData[0]?.total || 0,
        page,
        count: paginatedData.length,
        instantTotal: counts.instant || 0,
        creditTotal: counts.credit || 0,
      },
      data: paginatedData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error retrieving data", error: err.message });
  }
};

const getTrashPayment = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim();
    const tab = req.query.tab?.trim();

    const searchRegex = new RegExp(search, "i");
    const statusRegex = new RegExp(`^${status}$`, "i");

    const lookupStage = {
      $lookup: {
        from: "projectdetails",
        localField: "p_id",
        foreignField: "p_id",
        as: "project",
      },
    };

    const unwindStage = {
      $unwind: {
        path: "$project",
        preserveNullAndEmptyArrays: true,
      },
    };

    const matchConditions = [{ "approval_status.stage": "Trash Pending" }];

    if (search) {
      matchConditions.push({
        $or: [
          { pay_id: { $regex: searchRegex } },
          { paid_for: { $regex: searchRegex } },
          { po_number: { $regex: searchRegex } },
          { vendor: { $regex: searchRegex } },
          { utr: { $regex: searchRegex } },
          { "project.customer": { $regex: searchRegex } },
        ],
      });
    }

    if (status) {
      matchConditions.push({
        approved: { $regex: statusRegex },
      });
    }

    const baseMatch = { $and: matchConditions };

    const basePipeline = [
      lookupStage,
      unwindStage,
      { $match: baseMatch },
      {
        $addFields: {
          customer_name: "$project.customer",
          type: {
            $cond: {
              if: { $eq: ["$credit.credit_status", true] },
              then: "credit",
              else: "instant",
            },
          },
        },
      },
    ];

    const tabMatchStage = tab ? [{ $match: { type: tab } }] : [];

    const [paginatedData, totalData] = await Promise.all([
      payRequestModells.aggregate([
        ...basePipeline,
        ...tabMatchStage,
        { $project: { project: 0 } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
      ]),
      payRequestModells.aggregate([
        ...basePipeline,
        ...tabMatchStage,
        { $count: "total" },
      ]),
    ]);

    const tabWiseCounts = await payRequestModells.aggregate([
      ...basePipeline,
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = {
      instant: 0,
      credit: 0,
    };
    tabWiseCounts.forEach((item) => {
      counts[item._id] = item.count;
    });

    res.status(200).json({
      msg: "trash-payments",
      meta: {
        total: totalData[0]?.total || 0,
        page,
        count: paginatedData.length,
        instantTotal: counts.instant || 0,
        creditTotal: counts.credit || 0,
      },
      data: paginatedData,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ msg: "Error retrieving trash payments", error: err.message });
  }
};

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
  restoreTrashToDraft,
  // getVendorById,
  newAppovAccount,
  deletePayRequestById,
  editPayRequestById,
  getPayRequestById,
  excelData,
  updateExcelData,
  restorepayrequest,
  getPay,
  deadlineExtendRequest,
  requestCreditExtension,
  getTrashPayment,
  approve_pending,
  hold_approve_pending,
  updateExceData,
  getExcelDataById,
  getpy,
};
