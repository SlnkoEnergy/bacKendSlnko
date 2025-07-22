const CreditModel = require("../../Modells/addMoneyModells");
const DebitModel = require("../../Modells/debitMoneyModells");
const AdjustmentModel = require("../../Modells/adjustmentRequestModells");
const ClientModel = require("../../Modells/purchaseOrderModells");
const ProjectModel = require("../../Modells/projectModells");

const getCustomerPaymentSummary = async (req, res) => {
  try {
    const { p_id, start_date, end_date, vendor } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const projectId = isNaN(p_id) ? p_id : Number(p_id);
    let creditDateMatch = { p_id: projectId };
    let debitDateMatch = { p_id: projectId };
    let adjustmentDateMatch = { p_id: projectId };

    if (vendor) {
      debitDateMatch.vendor = { $regex: vendor, $options: "i" };
    }

    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999); // Include full day

      creditDateMatch.cr_date = { $gte: startDate, $lte: endDate };
      debitDateMatch.dbt_date = { $gte: startDate, $lte: endDate };
      adjustmentDateMatch.createdAt = { $gte: startDate, $lte: endDate };
      // 1️⃣ Project Details
      const [project] = await ProjectModel.aggregate([
        { $match: { p_id: projectId } },
        {
          $project: {
            _id: 0,
            customer_name: 1,
            p_group: 1,
            project_kwp: 1,
            name: 1,
            code: 1,
          },
        },
        { $limit: 1 },
      ]);

      if (!project) {
        return res.status(404).json({ error: "Project not found." });
      }

      // 2️⃣ Credit Aggregation
      const [creditData] = await CreditModel.aggregate([
        { $match: creditDateMatch },
        {
          $facet: {
            history: [
              { $sort: { createdAt: -1 } },
              {
                $project: {
                  _id: 0,
                  cr_date: 1,
                  cr_mode: 1,
                  cr_amount: 1,
                  createdAt: 1,
                },
              },
            ],
            summary: [
              {
                $group: {
                  _id: null,
                  totalCredited: { $sum: "$cr_amount" },
                },
              },
            ],
          },
        },
      ]);

      const creditHistory = creditData?.history || [];
      const totalCredited = creditData?.summary[0]?.totalCredited || 0;

      // 3️⃣ Debit Aggregation
      const [debitData] = await DebitModel.aggregate([
        { $match: debitDateMatch },
        {
          $facet: {
            history: [
              { $sort: { createdAt: -1 } },
              {
                $project: {
                  _id: 0,
                  db_date: 1,
                  db_mode: 1,
                  amount_paid: 1,
                  paid_for: 1,
                  po_number: 1,
                  utr: 1,
                  updatedAt: 1,
                  createdAt: 1,
                  paid_to: "$vendor",
                  debit_date: "$dbt_date",
                },
              },
            ],
            summary: [
              {
                $group: {
                  _id: null,
                  totalDebited: { $sum: "$amount_paid" },
                },
              },
            ],
          },
        },
      ]);

      const debitHistory = debitData?.history || [];
      const totalDebited = debitData?.summary[0]?.totalDebited || 0;

      // 4️⃣ Adjustment Aggregation
      const [adjustmentData] = await AdjustmentModel.aggregate([
        { $match: adjustmentDateMatch },
        {
          $facet: {
            history: [
              { $sort: { createdAt: -1 } },
              {
                $project: {
                  _id: 0,
                  adj_type: 1,
                  adj_amount: 1,
                  adj_date: 1,
                  comment: 1,
                  po_number: 1,
                  updatedAt: 1,
                  createdAt: 1,
                  paid_for: 1,
                  debit_adjustment: {
                    $cond: [
                      { $eq: ["$adj_type", "Subtract"] },
                      "$adj_amount",
                      null,
                    ],
                  },
                  credit_adjustment: {
                    $cond: [{ $eq: ["$adj_type", "Add"] }, "$adj_amount", null],
                  },
                  description: "$comment",
                },
              },
            ],
            summary: [
              {
                $group: {
                  _id: null,
                  totalAdjusted: { $sum: "$adj_amount" },
                },
              },
            ],
          },
        },
      ]);

      const adjustmentHistory = adjustmentData?.history || [];

      // 5️⃣ Net Balance
      const netBalance = totalCredited - totalDebited;

      // 6️⃣ Final Response
      return res.status(200).json({
        projectDetails: {
          customer_name: project.customer_name,
          p_group: project.p_group,
          project_kwp: project.project_kwp,
          name: project.name,
          code: project.code,
        },
        credit: {
          history: creditHistory,
          total: totalCredited,
        },
        debit: {
          history: debitHistory,
          total: totalDebited,
        },
        adjustment: {
          history: adjustmentHistory,
        },
        summary: {
          totalCredited,
          totalDebited,
          netBalance,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Client History
const clientHistory = async (req, res) => {
  try {
    const { p_id, vendor } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const cleanPId = isNaN(p_id) ? p_id : Number(p_id);

    const result = await ProjectModel.aggregate([
      { $match: { p_id: cleanPId } },
      { $project: { code: 1, _id: 0 } },

      // Lookup Purchase Orders using code
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders",
        },
      },
      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
      },
      // 🔍 Apply vendor filter if vendor is provided
      ...(vendor
        ? [
            {
              $match: {
                "purchase_orders.vendor": {
                  $regex: vendor,
                  $options: "i", // case-insensitive
                },
              },
            },
          ]
        : []),

      // Lookup Approved and Matched Payments with UTR
      {
        $lookup: {
          from: "payrequests",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] },
                    { $eq: ["$approved", "Approved"] },
                    { $eq: ["$acc_match", "matched"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalPaid: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "approved_payment",
        },
      },
      // Add advance_paid field
      {
        $addFields: {
          advance_paid: {
            $cond: {
              if: { $gt: [{ $size: "$approved_payment" }, 0] },
              then: { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
              else: 0,
            },
          },
        },
      },
      {
        $lookup: {
          from: "biildetails",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$po_number" }, "$$po_numberStr"],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalBilled: { $sum: { $toDouble: "$bill_value" } },
              },
            },
          ],
          as: "billed_summary",
        },
      },

      {
        $addFields: {
          total_billed_value: {
            $cond: {
              if: { $gt: [{ $size: "$billed_summary" }, 0] },
              then: { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              else: 0,
            },
          },
        },
      },

      {
        $addFields: {
          remaining_amount: {
            $subtract: [
              { $toDouble: "$purchase_orders.po_value" },
              { $toDouble: "$advance_paid" },
            ],
          },
        },
      },

      // Final projection for frontend
      {
        $project: {
          _id: 0,
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$purchase_orders.vendor",
          item_name: "$purchase_orders.item",
          po_value: "$purchase_orders.po_value",
          advance_paid: 1,
          remaining_amount: 1,
          total_billed_value: 1,
        },
      },
    ]);

    const meta = result.reduce(
      (acc, curr) => {
        acc.total_advance_paid += Number(curr.advance_paid || 0);
        acc.total_remaining_amount += Number(curr.remaining_amount || 0);
        acc.total_billed_value += Number(curr.total_billed_value || 0);
        acc.total_po_value += Number(curr.po_value || 0);
        return acc;
      },
      {
        total_advance_paid: 0,
        total_remaining_amount: 0,
        total_billed_value: 0,
        total_po_value: 0,
      }
    );

    if (!result.length) {
      return res
        .status(404)
        .json({ error: "No project found with this p_id." });
    }

    return res.status(200).json({ data: result, meta });
  } catch (error) {
    console.error("Error fetching client history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Total Balance Summary

const totalBalanceSummary = async (req, res) => {
  try{
    const { p_id } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const cleanPId = isNaN(p_id) ? p_id : Number(p_id);

    const result = await ProjectModel.aggregate([
           {
        $match: { p_id: cleanPId }
      },
      {
        $lookup: {
          from: "addmoneys",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalCredit: { $sum: { $toDouble: "$cr_amount" } }
              }
            }
          ],
          as: "creditData"
        }
      },
      {
        $lookup: {
          from: "subtract moneys", // Make sure collection name has no space
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] },
                    { $eq: ["$paid_for", "Customer Adjustment"] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalReturn: { $sum: { $toDouble: "$amount_paid" } }
              }
            }
          ],
          as: "returnData"
        }
      },
      
         
{
  $addFields: {
    advanced_paid: {
      $sum: "$approved_payment.amount_paid"
    }
  }
},
      
      {
        $addFields: {
          totalCredit: {
            $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0]
          },
          totalReturn: {
            $ifNull: [{ $arrayElemAt: ["$returnData.totalReturn", 0] }, 0]
          },
          netBalance: {
            $subtract: [
              { $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0] },
              { $ifNull: [{ $arrayElemAt: ["$returnData.totalReturn", 0] }, 0] }
            ]
          },   advanced_paid: {
      $ifNull: [
        { $sum: "$approved_payment.amount_paid" },
        0
      ]
    }
        }
      },
      {
        $project: {
          _id: 0,
          project_id: "$p_id",
          credit_amount: "$totalCredit",
          totalReturn: 1,
          netBalance: 1,
          advanced_paid: 1,
        }
      }
    ]);

    return res.status(200).json({ result });
  } catch (error) {
    console.error("Error fetching total balance summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getCustomerPaymentSummary,
  clientHistory,
  totalBalanceSummary,
};
