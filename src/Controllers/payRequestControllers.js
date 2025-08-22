const payRequestModells = require("../Modells/payRequestModells");
const projectModells = require("../Modells/project.model");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");
const vendorModells = require("../Modells/vendor.model");
const purchaseOrderModells = require("../Modells/purchaseorder.model");
const { get, default: mongoose } = require("mongoose");
const exccelDataModells = require("../Modells/excelDataModells");
const recoverypayrequest = require("../Modells/recoveryPayrequestModells");
const subtractMoneyModells = require("../Modells/debitMoneyModells");
const materialCategoryModells = require("../Modells/materialcategory.model");
const userModells = require("../Modells/users/userModells");
const utrCounter = require("../Modells/utrCounter");

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

    // ---------- basic validations ----------
    if (!p_id && !code) {
      return res
        .status(400)
        .json({ msg: "Either p_id or project code is required." });
    }

    if (!dbt_date || isNaN(new Date(dbt_date).getTime())) {
      return res.status(400).json({ msg: "Valid dbt_date is required." });
    }

    const amountNum = Number(amount_paid);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res
        .status(400)
        .json({ msg: "amount_paid must be a positive number." });
    }

    // ---------- project lookup (by p_id or code) ----------
    const project = await projectModells
      .findOne({
        $or: [
          ...(p_id ? [{ p_id: Number(p_id) }] : []),
          ...(code ? [{ code: String(code).trim() }] : []),
        ],
      })
      .lean();

    if (!project?.code) {
      return res.status(400).json({ msg: "Invalid or missing project." });
    }

    // ---------- allocate ids ----------
    let pay_id = null;
    let cr_id = null;

    if (credit?.credit_status === true) {
      if (
        !credit.credit_deadline ||
        isNaN(new Date(credit.credit_deadline).getTime())
      ) {
        return res.status(400).json({
          msg: "Valid credit_deadline is required when credit_status is true.",
        });
      }

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
      } while (await payRequestModells.exists({ cr_id }));
    } else {
      do {
        pay_id = `${project.code}/${generateRandomCode()}`;
      } while (await payRequestModells.exists({ pay_id }));
    }

    // ---------- initial stage & histories ----------
    const initialStage = credit?.credit_status ? "Credit Pending" : "Draft";

    const newPayment = new payRequestModells({
      p_id: Number(p_id) || project.p_id,
      pay_id,
      cr_id,

      // payment body
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
        credit_extension: !!credit?.credit_extension,
        credit_remarks: credit?.credit_remarks || "",
        user_id: userId || null,
      },

      status_history: [
        {
          stage: initialStage,
          remarks: "",
          user_id: userId || null,
          timestamp: new Date(),
        },
      ],

      credit_history: credit?.credit_status
        ? [
            {
              status: "Created",
              credit_deadline: credit.credit_deadline,
              credit_remarks: credit.credit_remarks || "",
              user_id: userId || null,
              timestamp: new Date(),
            },
          ]
        : [],
    });

    newPayment.$locals = newPayment.$locals || {};
    newPayment.$locals.actorId = userId || null;

    await newPayment.save();

    return res.status(200).json({
      msg: "Payment requested successfully",
      newPayment,
    });
  } catch (error) {
    console.error("payRrequest error:", error);
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
  const { pay_id, cr_id, acc_number, ifsc, submitted_by } = req.body;

  try {
    const normalizedAcc = String(acc_number).trim();
    const normalizedIfsc = String(ifsc).trim();

    const query = {
      ifsc: normalizedIfsc,
      acc_number: normalizedAcc,
      $or: [],
    };

    if (pay_id) query.$or.push({ pay_id: String(pay_id).trim() });
    if (cr_id) query.$or.push({ cr_id: String(cr_id).trim() });

    if (query.$or.length === 0) {
      return res.status(400).json({
        message: "Either pay_id or cr_id is required.",
      });
    }

    const payment = await payRequestModells.findOneAndUpdate(
      query,
      { $set: { acc_match: "matched" } },
      { new: true }
    );

    if (payment) {
      res.status(200).json({
        message: "Account matched successfully!",
        data: payment,
      });

      const newExcelData = new exccelDataModells({
        ...payment.toObject(),
        submitted_by,
        acc_match: "matched",
        status: "Not-paid",
      });
      await newExcelData.save();
    } else {
      res.status(404).json({
        message: "No matching record found for given pay_id/cr_id.",
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
    const { _id, pay_id, cr_id, status, remarks } = req.body;

    const ACTIONS = ["Approved", "Rejected", "Pending"];
    if (!status || !ACTIONS.includes(status)) {
      return res
        .status(400)
        .json({ message: "status must be Approved, Rejected, or Pending" });
    }

    // Keep (or relax) this rule
    if (status === "Rejected" && !remarks?.trim()) {
      return res
        .status(400)
        .json({ message: "Remarks are required when status is Rejected" });
    }

    const currentUser = await userModells.findById(req.user.userId).lean();
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { department, role, _id: actorId } = currentUser;
    if (role !== "manager") {
      return res
        .status(403)
        .json({ message: "Only managers can approve or reject" });
    }

    // -------- Resolve target payment _ids from _id | pay_id | cr_id --------
    let ids = [];

    if (_id) {
      ids = Array.isArray(_id) ? _id : [_id];
    } else if (pay_id) {
      const doc = await payRequestModells
        .findOne({ pay_id: String(pay_id).trim() })
        .select("_id");
      if (doc) ids = [doc._id];
    } else if (cr_id) {
      const docs = await payRequestModells
        .find({ cr_id: String(cr_id).trim() })
        .select("_id");
      ids = docs.map((d) => d._id);
    } else {
      return res
        .status(400)
        .json({ message: "Provide one of: _id | pay_id | cr_id" });
    }

    if (!ids.length) {
      return res.status(404).json({
        message: "No matching payments found for given identifier(s)",
      });
    }

    const results = [];

    const pushStatusHistory = (
      paymentDoc,
      { stage, statusValue, remarksValue }
    ) => {
      if (!Array.isArray(paymentDoc.status_history))
        paymentDoc.status_history = [];
      paymentDoc.status_history.push({
        stage,
        user_id: actorId,
        department,
        role,
        remarks: (remarksValue || "").trim(),
        status: statusValue,
        timestamp: new Date(),
      });
    };

    const pushUtrHistory = (paymentDoc, { note, status = "UTRUpdated" }) => {
      if (!Array.isArray(paymentDoc.credit_history))
        paymentDoc.credit_history = [];
      paymentDoc.credit_history.push({
        status,
        credit_deadline: null,
        credit_remarks: note || "UTR auto-generated",
        user_id: actorId,
        timestamp: new Date(),
      });
    };

    const computeTransition = (currentStage) => {
      if (
        (currentStage === "Draft" || currentStage === "Credit Pending") &&
        department === "SCM"
      )
        return { nextStage: "CAM", approvedValue: "Pending" };
      if (currentStage === "CAM" && department === "Internal")
        return { nextStage: "Account", approvedValue: "Pending" };
      if (currentStage === "Account" && department === "Accounts")
        return { nextStage: "Initial Account", approvedValue: "Approved" };
      if (currentStage === "Initial Account" && department === "Accounts")
        return { nextStage: "Final", approvedValue: "Approved" };
      return null;
    };

    for (const id of ids) {
      try {
        if (!mongoose.isValidObjectId(id)) {
          results.push({
            _id: id,
            status: "error",
            message: "Invalid payment id",
          });
          continue;
        }

        const payment = await payRequestModells.findById(id);
        if (!payment) {
          results.push({
            _id: id,
            status: "error",
            message: "Payment not found",
          });
          continue;
        }

        const currentStage = payment.approval_status?.stage || "Draft";

        // ---------- REJECTION: allowed at ANY stage; sets stage="Rejected" ----------
        if (status === "Rejected") {
          const now = new Date();
          payment.approved = "Rejected";
          payment.approval_status = {
            stage: "Rejected",
            user_id: actorId,
            remarks: (remarks || "").trim(),
            rejected_at: now,
            rejected_by: { department, role },
          };

          pushStatusHistory(payment, {
            stage: "Rejected",
            statusValue: "Rejected",
            remarksValue: remarks,
          });

          await payment.save();

          results.push({
            _id: id,
            status: "success",
            message: "Payment rejected",
          });
          continue;
        }

        // ---------- SCM validations for PO/value (non-reject) ----------
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
                message:
                  "PO number is required for Material Category based payments.",
              });
              continue;
            }

            const purchaseOrder = await purchaseOrderModells
              .findOne({ po_number: poNumber })
              .lean();
            if (!purchaseOrder) {
              results.push({
                _id: id,
                status: "error",
                message: "Purchase order not found",
              });
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

        // ---------- transition (non-reject) ----------
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

        let generatedUtr = null;

        // Create/ensure UTR at "Initial Account"
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

          const isCRFlow =
            typeof payment.cr_id === "string" &&
            payment.cr_id.trim().length > 0;
          const isPayIdFlow =
            typeof payment.pay_id === "string" &&
            payment.pay_id.trim().length > 0;

          if (isPayIdFlow) {
            generatedUtr = payment.utr || null;
          } else if (isCRFlow) {
            if (!payment.utr) {
              const counter = await utrCounter.findOneAndUpdate(
                { p_id: projectIdNum },
                {
                  $inc: { count: 1, lastDigit: 1 },
                  $setOnInsert: { p_id: projectIdNum },
                },
                { new: true, upsert: true }
              );

              generatedUtr = `CR/${projectIdNum}/${String(counter.lastDigit).padStart(2, "0")}`;
              payment.utr = generatedUtr;

              pushUtrHistory(payment, {
                note: `UTR generated: ${generatedUtr}`,
                status: "UTRUpdated",
              });

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
              generatedUtr = payment.utr;
            }
          } else {
            results.push({
              _id: id,
              status: "error",
              message: "Neither CR flow nor pay_id flow. Cannot proceed.",
            });
            continue;
          }
        }

        // Final stage: stamp timer once
        if (nextStage === "Final") {
          payment.timers = payment.timers || {};
          if (!payment.timers.draft_frozen_at) {
            payment.timers.draft_frozen_at = new Date();
          }
        }

        // Persist approval state & status history
        payment.approved = approvedValue;
        payment.approval_status = {
          stage: nextStage,
          user_id: actorId,
          remarks: (remarks || "").trim(),
        };
        pushStatusHistory(payment, {
          stage: nextStage,
          statusValue: approvedValue,
          remarksValue: remarks,
        });

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

    return res
      .status(200)
      .json({ message: "Processed approval updates", results });
  } catch (error) {
    console.error("Error in accApproved:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const utrUpdate = async function (req, res) {
  const { pay_id, cr_id, utr, utr_submitted_by: bodySubmittedBy } = req.body;

  if (!utr || typeof utr !== "string" || !utr.trim()) {
    return res.status(400).json({ message: "Valid UTR is required." });
  }
  if (!pay_id && !cr_id) {
    return res.status(400).json({ message: "Provide either pay_id or cr_id." });
  }
  if (pay_id && cr_id) {
    return res
      .status(400)
      .json({ message: "Provide only one: pay_id or cr_id." });
  }

  const trimmedUtr = utr.trim();
  const submittedBy = (req.user && req.user.userId) || bodySubmittedBy || null;

  const session = await mongoose.startSession();
  let httpStatus = 200;
  let payload = null;

  const buildSubtractDoc = (p, useUtr) => ({
    p_id: p.p_id,
    pay_type: p.pay_type,
    amount_paid: p.amount_paid,
    amt_for_customer: p.amt_for_customer,
    dbt_date: p.dbt_date,
    paid_for: p.paid_for,
    vendor: p.vendor,
    po_number: p.po_number,
    utr: useUtr || p.utr,
  });

  try {
    await session.withTransaction(async () => {
      const paymentFilter = pay_id
        ? { pay_id, acc_match: "matched" }
        : { cr_id, "approval_status.stage": "Final" };

      let payment = await payRequestModells
        .findOne(paymentFilter)
        .session(session);

      if (!payment) {
        httpStatus = 404;
        payload = {
          message: pay_id
            ? "No matching record found for pay_id or account not matched."
            : "No matching record found with this CR ID at stage 'Final'.",
        };
        return;
      }

      const oldUtr = (payment.utr || "").trim() || null;
      const utrChanged = oldUtr !== trimmedUtr;

      const dup = await payRequestModells
        .findOne({ utr: trimmedUtr, _id: { $ne: payment._id } })
        .session(session);

      if (dup) {
        httpStatus = 409;
        payload = { message: "UTR already exists on another record." };
        return;
      }

      const setFields = {
        utr: trimmedUtr,
        ...(submittedBy ? { utr_submitted_by: submittedBy } : {}),
      };

      await payRequestModells.updateOne(
        { _id: payment._id },
        { $set: setFields },
        { session, runValidators: true }
      );

      payment.utr = trimmedUtr;
      if (submittedBy) payment.utr_submitted_by = submittedBy;

      const isCrPath = Boolean(cr_id);
      if (isCrPath && utrChanged) {
        await payRequestModells.updateOne(
          { _id: payment._id },
          {
            $push: {
              utr_history: {
                utr: trimmedUtr,
                user_id: submittedBy || undefined,
                status: oldUtr ? "Updated" : "Created",
              },
            },
          },
          { session, runValidators: true }
        );
      }

      let subtractMoneyDoc = null;

      if (utrChanged && oldUtr) {
        subtractMoneyDoc = await subtractMoneyModells.findOneAndUpdate(
          { utr: oldUtr },
          { $set: buildSubtractDoc(payment, trimmedUtr) },
          { new: true, session, runValidators: true }
        );

        if (!subtractMoneyDoc) {
          subtractMoneyDoc = await subtractMoneyModells.findOneAndUpdate(
            { utr: trimmedUtr },
            { $set: buildSubtractDoc(payment, trimmedUtr) },
            { new: true, upsert: true, session, runValidators: true }
          );
        }
      } else {
        subtractMoneyDoc = await subtractMoneyModells.findOneAndUpdate(
          { utr: trimmedUtr },
          { $set: buildSubtractDoc(payment, trimmedUtr) },
          { new: true, upsert: true, session, runValidators: true }
        );
      }

      httpStatus = 200;
      payload = {
        message: isCrPath
          ? utrChanged
            ? "Credit UTR Updated"
            : "UTR unchanged via cr_id; details synced."
          : utrChanged
            ? "Payment UTR Submitted"
            : "UTR unchanged via pay_id; details synced.",
        data: payment,
        subtractMoney: subtractMoneyDoc,
      };
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res
        .status(409)
        .json({ message: "UTR already exists.", error: error.message });
    }
    console.error("utrUpdate error:", error);
    return res.status(500).json({
      message: "An error occurred while updating the UTR number.",
      error: error?.message,
    });
  } finally {
    session.endSession();
  }

  return res.status(httpStatus).json(payload);
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
    const pageSize = parseInt(req.query.pageSize) || 50;
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
