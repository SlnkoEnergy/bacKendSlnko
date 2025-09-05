const projectModells = require("../Modells/project.model");

const num = (expr) => ({
  $let: {
    vars: { v: expr },
    in: {
      $cond: [
        { $isNumber: "$$v" },
        "$$v",
        {
          $convert: {
            input: {
              $replaceAll: {
                input: { $trim: { input: "$$v" } },
                find: ",",
                replacement: "",
              },
            },
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
      ],
    },
  },
});

function buildPipeline({ search = "", group = "" }) {
  const searchMatch = {
    ...(search && {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { customer: { $regex: search, $options: "i" } },
        { p_group: { $regex: search, $options: "i" } },
      ],
    }),
    ...(group && { p_group: group }),
  };

  return [
    { $match: searchMatch },

    // Joins (adjust collection names if yours differ)
    { $lookup: { from: "addmoneys",          localField: "p_id",  foreignField: "p_id",   as: "credits" } },
    { $lookup: { from: "subtract moneys",     localField: "p_id",  foreignField: "p_id",   as: "debits" } },
    { $lookup: { from: "adjustmentrequests", localField: "p_id",  foreignField: "p_id",   as: "adjustments" } },

    // Projects table uses project code in po.p_id (common in your codebase)
    { $lookup: { from: "purchaseorders",     localField: "code",  foreignField: "p_id",   as: "pos" } },

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

    // NOTE: ensure the collection name here matches your DB.
    { $lookup: { from: "biildetails", localField: "pos.po_number", foreignField: "po_number", as: "bills" } },

    // ----------------- NEW: filter "paid" debits as fallback -----------------
    {
      $addFields: {
        paidDebits: {
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
      },
    },
    // ----------------- NEW: unified paidAmount (prefer pays) -----------------
    {
      $addFields: {
        paidAmount: {
          $cond: [
            { $gt: [{ $size: "$pays" }, 0] },
            { $sum: { $map: { input: "$pays",       as: "p", in: num("$$p.amount_paid") } } },
            { $sum: { $map: { input: "$paidDebits", as: "d", in: num("$$d.amount_paid") } } },
          ],
        },
      },
    },
    // ------------------------------------------------------------------------

    // ---- PO totals ----
    {
      $addFields: {
        total_po_basic: {
          $round: [
            {
              $sum: {
                $map: { input: "$pos", as: "po", in: num("$${po}.po_basic".replace("$${po}", "$$po")) },
              },
            },
            2,
          ],
        },
        gst_as_po_basic: {
          $round: [
            {
              $sum: {
                $map: { input: "$pos", as: "po", in: num("$${po}.gst".replace("$${po}", "$$po")) },
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

    // ---- Credit / Debit / Adjustments & computed figures ----
    {
      $addFields: {
        totalCredit: {
          $round: [{ $sum: { $map: { input: "$credits", as: "c", in: num("$$c.cr_amount") } } }, 2],
        },
        totalDebit: {
          $round: [{ $sum: { $map: { input: "$debits", as: "d", in: num("$$d.amount_paid") } } }, 2],
        },
        availableAmount: {
          $round: [
            {
              $subtract: [
                { $sum: { $map: { input: "$credits", as: "c", in: num("$$c.cr_amount") } } },
                { $sum: { $map: { input: "$debits",  as: "d", in: num("$$d.amount_paid") } } },
              ],
            },
            2,
          ],
        },
        customerAdjustmentTotal: {
          $round: [
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
                  in: num("$$d.amount_paid"),
                },
              },
            },
            2,
          ],
        },
        creditAdjustment: {
          $round: [
            {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: "$adjustments",
                      as: "adj",
                      cond: { $eq: ["$$adj.adj_type", "Add"] },
                    },
                  },
                  as: "a",
                  in: { $abs: num("$$a.adj_amount") },
                },
              },
            },
            2,
          ],
        },
        debitAdjustment: {
          $round: [
            {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: "$adjustments",
                      as: "adj",
                      cond: { $eq: ["$$adj.adj_type", "Subtract"] },
                    },
                  },
                  as: "a",
                  in: { $abs: num("$$a.adj_amount") },
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
        totalAdjustment: { $round: [{ $subtract: ["$creditAdjustment", "$debitAdjustment"] }, 2] },

        // ----------------- CHANGED: totalAmountPaid uses paidAmount -----------------
        totalAmountPaid: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] },
        // ---------------------------------------------------------------------------

        totalPoValue: {
          $round: [{ $sum: { $map: { input: "$pos", as: "po", in: num("$$po.po_value") } } }, 2],
        },
        totalBillValue: {
          $round: [{ $sum: { $map: { input: "$bills", as: "b", in: num("$$b.bill_value") } } }, 2],
        },
        // (kept as-is) netAdvance & balancePayable logic
        netAdvance: {
          $round: [
            {
              $subtract: [
                { $sum: { $map: { input: "$pays",  as: "p", in: num("$$p.amount_paid") } } },
                { $sum: { $map: { input: "$bills", as: "b", in: num("$$b.bill_value") } } },
              ],
            },
            2,
          ],
        },
      },
    },

    // Net balance from credits minus customer adjustment debits
    {
      $addFields: {
        netBalance: {
          $round: [
            {
              $subtract: [
                { $sum: { $map: { input: "$credits", as: "c", in: num("$$c.cr_amount") } } },
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
                      in: num("$$d.amount_paid"),
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
        balanceSlnko: {
          $round: [
            {
              $subtract: [
                { $subtract: [{ $ifNull: ["$netBalance", 0] }, { $ifNull: ["$totalAmountPaid", 0] }] },
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
        balancePayable: {
          $round: [
            {
              $subtract: [
                {
                  $subtract: [
                    { $ifNull: ["$total_po_with_gst", 0] },
                    { $sum: { $map: { input: "$bills", as: "b", in: num("$$b.bill_value") } } },
                  ],
                },
                {
                  $subtract: [
                    { $sum: { $map: { input: "$pays",  as: "p", in: num("$$p.amount_paid") } } },
                    { $sum: { $map: { input: "$bills", as: "b", in: num("$$b.bill_value") } } },
                  ],
                },
              ],
            },
            2,
          ],
        },
      },
    },

    // TCS if netBalance > 50L
    {
      $addFields: {
        tcs: {
          $cond: {
            if: { $gt: ["$netBalance", 5000000] },
            then: { $round: [{ $multiply: [{ $subtract: ["$netBalance", 5000000] }, 0.001] }, 0] },
            else: 0,
          },
        },
      },
    },

    {
      $addFields: {
        balanceRequired: {
          $round: [{ $subtract: [{ $subtract: ["$balanceSlnko", "$balancePayable"] }, "$tcs"] }, 2],
        },
      },
    },

    // Normalize project_kwp (auto /1000 if looks like W instead of kW)
    {
      $addFields: {
        project_kwp: {
          $let: {
            vars: { v: num("$project_kwp") },
            in: { $cond: [{ $gt: ["$$v", 100] }, { $divide: ["$$v", 1000] }, "$$v"] },
          },
        },
      },
    },

    // Activity dates for sorting
    {
      $addFields: {
        latestCreditCreatedAt: {
          $max: { $map: { input: "$credits", as: "c", in: "$$c.createdAt" } },
        },
        latestDebitUpdatedAt: {
          $max: { $map: { input: "$debits", as: "d", in: "$$d.updatedAt" } },
        },
        latestActivityDate: {
          $max: [
            { $max: { $map: { input: "$credits", as: "c", in: "$$c.createdAt" } } },
            { $max: { $map: { input: "$debits",  as: "d", in: "$$d.updatedAt" } } },
          ],
        },
      },
    },

    // Final projection
    {
      $project: {
        _id: 1, p_id: 1, code: 1, name: 1, customer: 1, p_group: 1,
        project_kwp: 1,
        totalCredit: 1, totalDebit: 1, totalAdjustment: 1, total_po_basic: 1,
        customerAdjustmentTotal: 1, availableAmount: 1, netBalance: 1,
        totalAmountPaid: 1, balanceSlnko: 1, netAdvance: 1, tcs: 1,
        balancePayable: 1, total_po_with_gst: 1, gst_as_po_basic: 1,
        balanceRequired: 1, latestActivityDate: 1,
      },
    },
  ];
}

async function runProjectBalance({ page = 1, pageSize = 10, search = "", group = "" }) {
  const base = buildPipeline({ search, group });

  const countPipeline = [...base, { $count: "total" }];

  const pagePipeline = [
    ...base,
    { $sort: { latestActivityDate: -1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ];

  const totalsPipeline = [
    ...base,
    {
      $group: {
        _id: null,
        totalProjectKwp: { $sum: { $ifNull: ["$project_kwp", 0] } },
        totalCreditSum: { $sum: "$totalCredit" },
        totalDebitSum: { $sum: "$totalDebit" },
        totalAdjustmentSum: { $sum: "$totalAdjustment" },
        totalAvailableAmount: { $sum: "$availableAmount" },
        totalBalanceSlnko: { $sum: "$balanceSlnko" },
        totalBalancePayable: { $sum: "$balancePayable" },
        totalBalanceRequired: { $sum: "$balanceRequired" },
      },
    },
    {
      $project: {
        _id: 1,
        totalProjectKwp: { $round: ["$totalProjectKwp", 2] },
        totalCreditSum: { $round: ["$totalCreditSum", 2] },
        totalDebitSum: { $round: ["$totalDebitSum", 2] },
        totalAdjustmentSum: { $round: ["$totalAdjustmentSum", 2] },
        totalAvailableAmount: { $round: ["$totalAvailableAmount", 2] },
        totalBalanceSlnko: { $round: ["$totalBalanceSlnko", 2] },
        totalBalancePayable: { $round: ["$totalBalancePayable", 2] },
        totalBalanceRequired: { $round: ["$totalBalanceRequired", 2] },
      },
    },
  ];

  const [data, countArr, totalsArr] = await Promise.all([
    projectModells.aggregate(pagePipeline),
    projectModells.aggregate(countPipeline),
    projectModells.aggregate(totalsPipeline),
  ]);

  return {
    success: true,
    meta: { total: countArr?.[0]?.total || 0, page, pageSize, count: data.length },
    data,
    totals: totalsArr?.[0] || {},
  };
}


module.exports = { runProjectBalance };
