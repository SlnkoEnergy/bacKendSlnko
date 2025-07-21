const CreditModel = require("../../Modells/addMoneyModells");
const DebitModel = require("../../Modells/debitMoneyModells");
const AdjustModel = require("../../Modells/adjustmentRequestModells");
const ClientModel = require("../../Modells/purchaseOrderModells");
const ProjectModel = require("../../Modells/projectModells");

const getCustomerPaymentSummary = async (req, res) => {
  try {
    const { p_id } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const projectId = Number(p_id);

    // 2️⃣ Fetch Project Details using Aggregation
    const projectPipeline = [
      { $match: { p_id: projectId } },
      {
        $project: {
          customer_name: 1,
          p_group: 1,
          project_kwp: 1,
          name: 1,
          code: 1,
          _id: 0,
        },
      },
      { $limit: 1 },
    ];

    const [project] = await ProjectModel.aggregate(projectPipeline);

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    // 3️⃣ Credit Aggregation (without pagination)
    const creditPipeline = [
      { $match: { p_id: projectId } },
      {
        $facet: {
          history: [
            { $sort: { cr_date: -1 } },
            {
              $project: {
                cr_date: 1,
                cr_mode: 1,
                cr_amount: 1,
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
    ];

    const [creditData] = await CreditModel.aggregate(creditPipeline);
    const creditHistory = creditData?.history || [];
    const totalCredited = creditData?.summary[0]?.totalCredited || 0;

    // 4️⃣ Debit Aggregation (without pagination)
    const debitPipeline = [
      { $match: { p_id: projectId } },
      {
        $facet: {
          history: [
            { $sort: { db_date: -1 } },
            {
              $project: {
                db_date: 1,
                db_mode: 1,
                amount_paid: 1,
                paid_for: 1,
                po_number: 1,
                utr: 1,
                updatedAt: 1,
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
    ];

    const [debitData] = await DebitModel.aggregate(debitPipeline);
    const debitHistory = debitData?.history || [];
    const totalDebited = debitData?.summary[0]?.totalDebited || 0;

    // 5️⃣ Net Balance Calculation
    const netBalance = totalCredited - totalDebited;

    // 6️⃣ Send Response
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
      summary: {
        totalCredited,
        totalDebited,
        netBalance,
      },
    });
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//// 7️⃣ Client History
const clientHistory = async (req, res) => {
try {
    const { p_id } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const cleanPId = isNaN(p_id) ? p_id : Number(p_id);

    const result = await ProjectModel.aggregate([
      // Match project by p_id
      { $match: { p_id: cleanPId } },
      { $project: { code: 1, _id: 0 } },

      // Lookup Purchase Orders using code
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders"
        }
      },
      { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true } },

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
              { $ne: ["$utr", ""] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: { $toDouble: "$amount_paid" } }
        }
      }
    ],
    as: "approved_payment"
  }
},
      // Add advance_paid field
      {
        $addFields: {
          advance_paid: {
            $cond: {
              if: { $gt: [{ $size: "$approved_payment" }, 0] },
              then: { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
              else: 0
            }
          }
        }
      }, {
        $lookup: {
          from: "biildetails",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$po_number" }, "$$po_numberStr"]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalBilled: { $sum: { $toDouble: "$bill_value" } }
              }
            }
          ],
          as: "billed_summary"
        }
      },

      {
        $addFields: {
          total_billed_value: {
            $cond: {
              if: { $gt: [{ $size: "$billed_summary" }, 0] },
              then: { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              else: 0
            }
          }
        }
      },

      {
        $addFields: {
          remaining_amount: {
            $subtract: [
              { $toDouble: "$purchase_orders.po_value" },
              { $toDouble: "$advance_paid" }
            ]
          }
        }
      },


      // Final projection for frontend
      {
        $project: {
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$purchase_orders.vendor",
          item_name: "$purchase_orders.item",
          po_value: "$purchase_orders.po_value",
          advance_paid: 1,
           remaining_amount: 1,
          total_billed_value: 1
        }
      }
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
      return res.status(404).json({ error: "No project found with this p_id." });
    }

    return res.status(200).json({ data: result, meta} );
  } catch (error) {
    console.error("Error fetching client history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


// //Adjustment Data
//    const adjustData = await =AdjustModel.aggregate([
//       { $match: { p_id: String(cleanPId) } },
//       {
//         $group: {
//           _id: "$adj_type",
//           total: { $sum: { $abs: { $toDouble: "$adj_amount" } } }
//         }
//       }
//     ]);

//     const adjustmentSummary = adjustData.reduce(
//       (acc, curr) => {
//         if (curr._id === "Add") acc.creditTotal = curr.total;
//         else if (curr._id === "Subtract") acc.debitTotal = curr.total;
//         return acc;
//       },
//       { creditTotal: 0, debitTotal: 0 }
//     );

//     // 4️⃣ Final response
//     res.status(200).json({
//       project_code: projectCode,
//       billing_type: billingType,
//       purchaseOrders: poData,
//       adjustments: adjustmentSummary
//     });

//   } catch (err) {
//     console.error("Error in getClientFinanceSummary:", err);
//     res.status(500).json({ error: "Internal server error." });
//   }
// };
module.exports = { getCustomerPaymentSummary, clientHistory };
