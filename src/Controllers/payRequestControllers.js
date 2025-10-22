const payRequestModells = require("../models/payRequestModells");
const projectModells = require("../models/project.model");
const holdPayment = require("../models/holdPaymentModells");
const holdPaymentModells = require("../models/holdPaymentModells");
const vendorModells = require("../models/vendor.model");
const purchaseOrderModells = require("../models/purchaseorder.model");
const { get, default: mongoose } = require("mongoose");
const exccelDataModells = require("../models/excelDataModells");
const recoverypayrequest = require("../models/recoveryPayrequestModells");
const subtractMoneyModells = require("../models/debitMoneyModells");
const materialCategoryModells = require("../models/materialcategory.model");
const userModells = require("../models/user.model");
const utrCounter = require("../models/utrCounter");
const projectBalanceModel = require("../models/projectBalance.model");
const { sendUsingTemplate } = require("../utils/sendemail.utils");

const generateRandomCode = () => Math.floor(100 + Math.random() * 900);
const generateRandomCreditCode = () => Math.floor(1000 + Math.random() * 9000);

const toNum = (expr) => ({
  $convert: {
    input: {
      $cond: [
        { $eq: [{ $type: expr }, "string"] },
        {
          $replaceAll: {
            input: { $trim: { input: expr } },
            find: ",",
            replacement: "",
          },
        },
        expr,
      ],
    },
    to: "double",
    onError: 0,
    onNull: 0,
  },
});

const aggregationPipeline = [
  {
    $lookup: {
      from: "addmoneys",
      localField: "p_id",
      foreignField: "p_id",
      as: "credits",
    },
  },
  {
    $lookup: {
      from: "subtract moneys",
      localField: "p_id",
      foreignField: "p_id",
      as: "debits",
    },
  },
  {
    $lookup: {
      from: "adjustmentrequests",
      localField: "p_id",
      foreignField: "p_id",
      as: "adjustments",
    },
  },
  {
    $lookup: {
      from: "purchaseorders",
      let: { projectId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
      ],
      as: "pos",
    },
  },
  {
    $lookup: {
      from: "payrequests",
      let: { poNumbers: "$pos.po_number" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $in: ["$po_number", "$$poNumbers"] },
                { $eq: ["$approved", "Approved"] },
                { $ne: ["$utr", null] },
                { $ne: ["$utr", ""] },
              ],
            },
          },
        },
      ],
      as: "pays",
    },
  },
  {
    $lookup: {
      from: "biildetails",
      localField: "pos.po_number",
      foreignField: "po_number",
      as: "bills",
    },
  },

  {
    $addFields: {
      totalCredit: {
        $round: [
          {
            $sum: {
              $map: { input: "$credits", as: "c", in: toNum("$$c.cr_amount") },
            },
          },
          2,
        ],
      },
      totalDebit: {
        $round: [
          {
            $sum: {
              $map: { input: "$debits", as: "d", in: toNum("$$d.amount_paid") },
            },
          },
          2,
        ],
      },
      availableAmount: {
        $round: [
          {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: toNum("$$c.cr_amount"),
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: toNum("$$d.amount_paid"),
                  },
                },
              },
            ],
          },
          2,
        ],
      },
      totalAdjustment: {
        $round: [
          {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$adjustments",
                        as: "a",
                        cond: { $eq: ["$$a.adj_type", "Add"] },
                      },
                    },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$adjustments",
                        as: "a",
                        cond: { $eq: ["$$a.adj_type", "Subtract"] },
                      },
                    },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
              },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      paidAmount: {
        $cond: [
          { $gt: [{ $size: "$pays" }, 0] },
          {
            $sum: {
              $map: { input: "$pays", as: "p", in: toNum("$$p.amount_paid") },
            },
          },
          {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$debits",
                    as: "d",
                    cond: {
                      $and: [
                        { $eq: ["$$d.approved", "Approved"] },
                        { $ne: ["$$d.utr", null] },
                        { $ne: ["$$d.utr", ""] },
                      ],
                    },
                  },
                },
                as: "d",
                in: toNum("$$d.amount_paid"),
              },
            },
          },
        ],
      },
    },
  },
  {
    $addFields: {
      total_po_basic: {
        $round: [
          {
            $sum: {
              $map: {
                input: "$pos",
                as: "po",
                in: {
                  $convert: {
                    input: { $trim: { input: "$$po.po_basic" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          2,
        ],
      },
    },
  },
  {
    $addFields: {
      gst_as_po_basic: {
        $round: [
          {
            $sum: {
              $map: {
                input: "$pos",
                as: "d",
                in: {
                  $convert: {
                    input: { $trim: { input: "$$d.gst" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          2,
        ],
      },
    },
  },
  {
    $addFields: {
      total_po_with_gst: {
        $round: [{ $add: ["$total_po_basic", "$gst_as_po_basic"] }, 2],
      },
    },
  },
  {
    $addFields: {
      totalAmountPaid: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] },
      balancePayable: {
        $round: [
          {
            $subtract: [
              { $ifNull: ["$total_po_with_gst", 0] },
              { $ifNull: ["$paidAmount", 0] },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      netBalance: {
        $subtract: [
          { $ifNull: ["$totalCredit", 0] },
          {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$debits",
                    as: "d",
                    cond: { $eq: ["$$d.paid_for", "Customer Adjustment"] },
                  },
                },
                as: "d",
                in: toNum("$$d.amount_paid"),
              },
            },
          },
        ],
      },
    },
  },
  {
    $addFields: {
      balanceSlnko: {
        $round: [
          {
            $subtract: [
              {
                $subtract: [
                  { $ifNull: ["$netBalance", 0] },
                  { $ifNull: ["$totalAmountPaid", 0] },
                ],
              },
              { $ifNull: ["$totalAdjustment", 0] },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      tcs: {
        $cond: {
          if: { $gt: ["$netBalance", 5000000] },
          then: {
            $round: [
              { $multiply: [{ $subtract: ["$netBalance", 5000000] }, 0.001] },
              0,
            ],
          },
          else: 0,
        },
      },
    },
  },
  {
    $addFields: {
      balanceRequired: {
        $round: [
          {
            $subtract: [
              { $subtract: ["$balanceSlnko", "$balancePayable"] },
              "$tcs",
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $project: {
      _id: 1,
      p_id: 1,
      code: 1,
      customer: 1,
      name: 1,
      p_group: 1,
      totalCredit: 1,
      totalDebit: 1,
      availableAmount: 1,
      totalAdjustment: 1,
      totalAmountPaid: 1,
      balanceSlnko: 1,
      balancePayable: 1,
      balanceRequired: 1,
    },
  },
];

const payRrequest = async (req, res) => {
  try {
    const userId = req.user?.userId || null;

    const {
      p_id,
      pay_type,
      amount_paid,
      // amt_for_customer,
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

    const initialStage = credit?.credit_status ? "Credit Pending" : "Draft";

    const newPayment = new payRequestModells({
      p_id: Number(p_id) || project.p_id,
      pay_id,
      cr_id,

      // payment body
      pay_type,
      amount_paid,
      // amt_for_customer,
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

//get alll pay summary
const getPaySummary = async (req, res) => {
  try {
    const data = await payRequestModells.aggregate([{ $match: {} }]);

    res.status(200).json({ message: "Fetch Data Successfull", data: data });
  } catch (error) {
    res.status(500).json({ message: "Error in Fetching Data" });
  }
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

    if (status === "Rejected" && !remarks?.trim()) {
      return res
        .status(400)
        .json({ message: "Remarks are required when status is Rejected" });
    }

    const currentUser = await userModells.findById(req.user.userId).lean();
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { department, role, _id: actorId } = currentUser;
    if (role !== "manager" && role !== "visitor") {
      return res
        .status(403)
        .json({ message: "Only managers or visitors can approve or reject" });
    }
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

    const computeTransition = (payment, currentStage) => {
      if (
        (currentStage === "Draft" || currentStage === "Credit Pending") &&
        department === "SCM"
      ) {
        return { nextStage: "CAM", approvedValue: "Pending" };
      }
      if (
        currentStage === "CAM" &&
        role === "visitor" &&
        department === "Projects"
      ) {
        return { nextStage: "Account", approvedValue: "Pending" };
      }
      if (currentStage === "Account" && department === "Accounts") {
        if (payment?.pay_id && String(payment.pay_id).trim().length > 0) {
          return { nextStage: "Final", approvedValue: "Approved" };
        }

        return { nextStage: "Initial Account", approvedValue: "Approved" };
      }
      if (currentStage === "Initial Account" && department === "Accounts") {
        return { nextStage: "Final", approvedValue: "Approved" };
      }
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

        if (department === "SCM") {
          const paidFor = payment.paid_for?.trim();
          const poNumber = (payment.po_number ?? "").trim();

          const trimmedEqPoExpr = {
            $eq: [
              {
                $trim: {
                  input: { $ifNull: [{ $toString: "$po_number" }, ""] },
                },
              },
              poNumber,
            ],
          };

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
              .findOne({ $expr: trimmedEqPoExpr })
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
              .find({ approved: "Approved", $expr: trimmedEqPoExpr })
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

        const transition = computeTransition(payment, currentStage);
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
                  // amt_for_customer: payment.amt_for_customer,
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

        if (nextStage === "Final") {
          payment.timers = payment.timers || {};
          if (!payment.timers.draft_frozen_at) {
            payment.timers.draft_frozen_at = new Date();
          }
        }

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

  let emailPayload = null;

  const buildSubtractDoc = (p, useUtr) => ({
    p_id: p.p_id,
    pay_type: p.pay_type,
    amount_paid: p.amount_paid,
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

      if (payment.po_number && utrChanged) {
        const amt = Number(payment.amount_paid) || 0;
        if (amt > 0) {
          const refKey = pay_id
            ? `pay:${payment.pay_id}`
            : `cr:${payment.cr_id}`;
          const poDoc = await purchaseOrderModells
            .findOne({ po_number: payment.po_number }, { advance_paid_refs: 1 })
            .session(session);

          const alreadyCounted =
            Array.isArray(poDoc?.advance_paid_refs) &&
            poDoc.advance_paid_refs.includes(refKey);
          if (!alreadyCounted) {
            await purchaseOrderModells.updateOne(
              { po_number: payment.po_number },
              {
                $inc: { total_advance_paid: amt },
                $addToSet: { advance_paid_refs: refKey },
              },
              { session }
            );
          }
        }
      }

      const results = await projectModells
        .aggregate([
          { $match: { p_id: Number(payment.p_id) } },
          ...aggregationPipeline,
        ])
        .session(session);

      if (results.length) {
        const row = results[0];

        const debitEntry = utrChanged
          ? {
              dbt_date: payment.updatedAt ? new Date(payment.updatedAt) : new Date(),
              amount_paid: Number(payment.amount_paid) || 0,
              remarks: payment.remarks || payment.comment || payment.note || null,
              paid_for: payment.paid_for || null,
            }
          : null;

        const updateDoc = {
          $set: {
            p_id: row._id,
            totalCredited: row.totalCredit,
            totalDebited: row.totalDebit,
            amountAvailable: row.availableAmount,
            totalAdjustment: row.totalAdjustment,
            balanceSlnko: row.balanceSlnko,
            balancePayable: row.balancePayable,
            balanceRequired: row.balanceRequired,
          },
        };

        if (utrChanged && debitEntry) {
          updateDoc.$push = {
            recentDebits: {
              $each: [debitEntry],
              $position: 0,
              $slice: 3,
            },
          };
        }

        await projectBalanceModel.updateOne({ p_id: row._id }, updateDoc, {
          upsert: true,
          session,
        });
      }

      // --------- Stage email payload (send after commit) ----------
      if (utrChanged) {
        const projDoc = await projectModells
          .findOne({ p_id: Number(payment.p_id) }, { code: 1, name: 1 })
          .lean()
          .session(session);

        const paymentDate = payment.dbt_date || payment.updatedAt || new Date();

        emailPayload = {
          vendor_name: payment.vendor || "",
          project: { name: projDoc?.code || "" }, 
          payment: {
            date: paymentDate,
            amount: Number(payment.amount_paid) || 0,
          },
          utr: trimmedUtr,
          user_id:req.user.userId
        };
      }
      // -----------------------------------------------------------

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
  } catch (err) {
    if (err && err.code === 11000) {
      return res
        .status(409)
        .json({ message: "UTR already exists.", error: err.message });
    }
    console.error("utrUpdate error:", err);
    return res.status(500).json({
      message: "An error occurred while updating the UTR number.",
      error: err?.message,
    });
  } finally {
    session.endSession();
  }

  if (emailPayload) {
    setImmediate(() => {
      sendUsingTemplate("vendor-payment-confirmation", emailPayload, { strict: false })
        .catch((e) => console.error("[utrUpdate] email send error:", e?.message || e));
    });
  }

  return res.status(httpStatus).json(payload);
};

const restoreTrashToDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const user_id = req.user?.userId;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!remarks || typeof remarks !== "string" || remarks.trim() === "") {
      return res.status(400).json({ message: "Remarks are required" });
    }

    const request = await payRequestModells.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request?.approval_status?.stage !== "Trash Pending") {
      return res
        .status(400)
        .json({ message: "Request is not in Trash Pending stage" });
    }

    request.timers = request.timers || {};
    request.status_history = Array.isArray(request.status_history)
      ? request.status_history
      : [];

    const now = new Date();

    request.approval_status = {
      stage: "Draft",
      user_id,
      remarks,
    };

    request.status_history.push({
      stage: "Draft",
      user_id,
      remarks,
      event: "restore_from_trash",
      timestamp: now,
    });

    request.timers.trash_started_at = null;
    request.timers.draft_started_at = now;

    await request.save();

    return res.status(200).json({
      message: "Request successfully restored to Draft",
      data: request,
    });
  } catch (error) {
    console.error("Error in restoreTrashToDraft:", error);
    return res.status(500).json({ message: "Internal Server Error" });
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
  try {
    const {
      status = "Not-paid",
      search = "",
      page = 1,
      limit = 200,
    } = req.query;

    const numericPage = Math.max(parseInt(page) || 1, 1);
    const numericLimit = Math.min(Math.max(parseInt(limit) || 200, 1), 2000);
    const skip = (numericPage - 1) * numericLimit;

    const match = {};
    if (status && status !== "all") match.status = status;

    const searchRegex = search ? new RegExp(String(search), "i") : null;
    const searchOr = searchRegex
      ? [
          { vendor: searchRegex },
          { po_number: searchRegex },
          { paid_for: searchRegex },
          { benificiary: searchRegex },
          { acc_number: searchRegex },
          { ifsc: searchRegex },
          { utr: searchRegex },
        ]
      : [];

    const pipeline = [
      { $match: { ...match, ...(searchOr.length ? { $or: searchOr } : {}) } },

      {
        $addFields: {
          __amount_num: {
            $let: {
              vars: { x: { $ifNull: ["$amount_paid", 0] } },
              in: {
                $cond: [
                  { $eq: [{ $type: "$$x" }, "string"] },
                  {
                    $convert: {
                      input: {
                        $replaceAll: {
                          input: "$$x",
                          find: ",",
                          replacement: "",
                        },
                      },
                      to: "double",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                  {
                    $convert: {
                      input: "$$x",
                      to: "double",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                ],
              },
            },
          },
        },
      },

      {
        $addFields: {
          __dbt_date: {
            $convert: {
              input: "$dbt_date",
              to: "date",
              onError: null,
              onNull: null,
            },
          },
        },
      },

      {
        $lookup: {
          from: "projectdetails",
          let: { pid: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$p_id" }, { $toString: "$$pid" }],
                },
              },
            },
            { $project: { _id: 0, p_id: 1, code: 1 } },
          ],
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          debitAccount: "025305008971",
          pay_mod: { $cond: [{ $gt: ["$__amount_num", 200000] }, "R", "N"] },
          comment: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$po_number", "-"] },
                  " / ",
                  { $ifNull: ["$paid_for", "-"] },
                  " / ",
                  { $ifNull: ["$vendor", ""] },
                  " / ",
                  { $ifNull: ["$project.code", "-"] },
                ],
              },
            },
          },
          dbt_date_fmt: {
            $cond: [
              { $ifNull: ["$__dbt_date", false] },
              {
                $dateToString: {
                  format: "%d-%b-%Y",
                  date: "$__dbt_date",
                  timezone: "Asia/Kolkata",
                },
              },
              "",
            ],
          },
        },
      },

      { $sort: { createdAt: -1, _id: -1 } },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: numericLimit }],
          total: [{ $count: "value" }],
        },
      },
      {
        $project: {
          data: 1,
          total: { $ifNull: [{ $arrayElemAt: ["$total.value", 0] }, 0] },
        },
      },

      {
        $project: {
          total: 1,
          data: {
            $map: {
              input: "$data",
              as: "d",
              in: {
                id: "$$d._id",
                debitAccount: "$$d.debitAccount",
                Approved: { $ifNull: ["$$d.approved", ""] },
                acc_number: { $ifNull: ["$$d.acc_number", ""] },
                benificiary: { $ifNull: ["$$d.benificiary", ""] },
                amount_paid: { $ifNull: ["$$d.__amount_num", 0] },
                pay_mod: "$$d.pay_mod",
                dbt_date: "$$d.dbt_date_fmt",
                ifsc: { $ifNull: ["$$d.ifsc", ""] },
                comment: "$$d.comment",
                status: "$$d.status",
                utr: { $ifNull: ["$$d.utr", ""] },
                acc_match: { $ifNull: ["$$d.acc_match", ""] },
                payable_location: { $ifNull: ["$$d.payable_location", ""] },
                print_location: { $ifNull: ["$$d.print_location", ""] },
                bene_mobile_no: { $ifNull: ["$$d.bene_mobile_no", ""] },
                bene_email_id: { $ifNull: ["$$d.bene_email_id", ""] },
                bene_add1: { $ifNull: ["$$d.bene_add1", ""] },
                bene_add2: { $ifNull: ["$$d.bene_add2", ""] },
                bene_add3: { $ifNull: ["$$d.bene_add3", ""] },
                bene_add4: { $ifNull: ["$$d.bene_add4", ""] },
                add_details_1: { $ifNull: ["$$d.add_details_1", ""] },
                add_details_2: { $ifNull: ["$$d.add_details_2", ""] },
                add_details_3: { $ifNull: ["$$d.add_details_3", ""] },
                add_details_4: { $ifNull: ["$$d.add_details_4", ""] },
                add_details_5: { $ifNull: ["$$d.add_details_5", ""] },
              },
            },
          },
        },
      },
    ];

    const [result] = await exccelDataModells
      .aggregate(pipeline)
      .allowDiskUse(true);
    const total = result?.total || 0;
    const rows = result?.data || [];

    return res.status(200).json({
      msg: "Excel Data (server aggregated)",
      page: numericPage,
      limit: numericLimit,
      total,
      pages: Math.max(Math.ceil(total / numericLimit), 1),
      data: rows,
    });
  } catch (err) {
    console.error("[excelData] error:", err);
    return res.status(500).json({
      message: "Failed to load data",
      error: String(err?.message || err),
    });
  }
};

const updateExcelData = async function (req, res) {
  try {
    const { ids, _id, id, newStatus = "Deleted" } = req.body;

    let idList = [];
    if (Array.isArray(ids) && ids.length) idList = ids;
    else if (_id) idList = [_id];
    else if (id) idList = [id];

    if (!idList.length) {
      return res
        .status(400)
        .json({ message: "Provide 'ids' (array) or '_id'/'id' (string)." });
    }

    const objectIds = idList
      .map((v) => {
        try {
          return new mongoose.Types.ObjectId(String(v));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (!objectIds.length) {
      return res
        .status(400)
        .json({ message: "No valid Mongo ObjectIds in 'ids'." });
    }

    const result = await exccelDataModells.updateMany(
      { _id: { $in: objectIds }, status: "Not-paid" },
      { $set: { status: newStatus } }
    );

    return res.json({
      message: "Status updated",
      requested: idList.length,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      newStatus,
    });
  } catch (error) {
    console.error("[updateExcelData] error:", error);
    return res.status(500).json({
      message: "An error occurred while updating the item status.",
      error: String(error?.message || error),
    });
  }
};

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

const getPay = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const skip = (page - 1) * pageSize;

    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();
    const tab = (req.query.tab || "").trim();

    const searchRegex = search ? new RegExp(search, "i") : null;
    const shouldFilterStatus = status && status.toLowerCase() !== "all";
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const statusRegex = shouldFilterStatus
      ? new RegExp(`^${escapeRegex(status)}$`, "i")
      : null;

    let EmpDetail = false;
    if (req?.user?.emp_id !== undefined) {
      EmpDetail = req.user.emp_id === "SE-203";
    } else if (req?.user?._id || req?.user?.userId) {
      const id = req.user._id || req.user.userId;
      const u = await userModells.findById(id).select("emp_id").lean();
      EmpDetail = (u?.emp_id || "") === "SE-203";
    }
    const visibilityFilterStage = EmpDetail
      ? [{ $match: { paid_for: "I&C" } }]
      : [];

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

    const commonMatch = [];
    if (searchRegex) {
      commonMatch.push({
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

    const instantStageExclusion =
      tab === "instant"
        ? [{ $match: { "approval_status.stage": { $ne: "Trash Pending" } } }]
        : [];

    const statusMatchStage = statusRegex
      ? [{ $match: { approved: { $regex: statusRegex } } }]
      : [];

    const addTypeStage = {
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
    };

    const baseCommon = [
      lookupStage,
      unwindStage,
      ...(commonMatch.length ? [{ $match: { $and: commonMatch } }] : []),
      ...visibilityFilterStage,
      addTypeStage,
    ];

    const tabMatchStage = tab ? [{ $match: { type: tab } }] : [];

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

    const [paginatedData, totalData, tabWiseCounts] = await Promise.all([
      payRequestModells.aggregate([
        ...baseCommon,
        ...instantStageExclusion,
        ...statusMatchStage,
        ...tabMatchStage,
        ...remainingDaysStage,
        { $project: { project: 0 } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
      ]),
      payRequestModells.aggregate([
        ...baseCommon,
        ...instantStageExclusion,
        ...statusMatchStage,
        ...tabMatchStage,
        { $count: "total" },
      ]),
      payRequestModells.aggregate([
        ...baseCommon,
        ...statusMatchStage,
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);

    const countsByType = { instant: 0, credit: 0 };
    tabWiseCounts.forEach((t) => {
      if (t?._id === "instant") countsByType.instant = t.count;
      if (t?._id === "credit") countsByType.credit = t.count;
    });

    res.status(200).json({
      msg: "pay-summary",
      meta: {
        total: totalData[0]?.total || 0,
        page,
        count: paginatedData.length,
        instantTotal: countsByType.instant,
        creditTotal: countsByType.credit,
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
        // amt_for_customer: data.amt_for_customer,
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
        // amt_for_customer: data.amt_for_customer,
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
  getExcelDataById,
  getpy,
};
