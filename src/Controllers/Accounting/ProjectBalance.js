const projectModells = require("../../Modells/project.model");
const { Parser } = require("json2csv");

const projectBalance = async (req, res) => {
  const toNum = (expr) => ({
    $convert: {
      input: {
        $cond: [
          { $eq: [{ $type: expr }, "string"] },
          { $trim: { input: expr } },
          expr,
        ],
      },
      to: "double",
      onError: 0,
      onNull: 0,
    },
  });

  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || "";
    const group = req.query.group || "";

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

    const aggregationPipeline = [
      { $match: searchMatch },

      // --- Lookups ---
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
          localField: "code",
          foreignField: "p_id",
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
          totalCredit: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: toNum("$$c.cr_amount"),
                  },
                },
              },
              2,
            ],
          },
          totalDebit: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: toNum("$$d.amount_paid"),
                  },
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
                    in: toNum("$$d.amount_paid"),
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
                    in: { $abs: toNum("$$a.adj_amount") },
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
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
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
                            as: "adj",
                            cond: { $eq: ["$$adj.adj_type", "Add"] },
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
                            as: "adj",
                            cond: { $eq: ["$$adj.adj_type", "Subtract"] },
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
          totalPoValue: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$pos",
                    as: "po",
                    in: toNum("$$po.po_value"),
                  },
                },
              },
              2,
            ],
          },
          totalBillValue: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$bills",
                    as: "bill",
                    in: toNum("$$bill.bill_value"),
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
          netBalance: {
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
                        input: {
                          $filter: {
                            input: "$debits",
                            as: "d",
                            cond: {
                              $eq: ["$$d.paid_for", "Customer Adjustment"],
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
                  $map: {
                    input: "$pays",
                    as: "p",
                    in: toNum("$$p.amount_paid"),
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: "$paidDebits",
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
          totalAmountPaid: { $round: [{ $ifNull: ["$paidAmount", 0] }, 2] },
          netAdvance: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$paidAmount", 0] },
                  { $ifNull: ["$totalBillValue", 0] },
                ],
              },
              2,
            ],
          },
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

      // --- TCS ---
      {
        $addFields: {
          tcs: {
            $cond: {
              if: { $gt: ["$netBalance", 5000000] },
              then: {
                $round: [
                  {
                    $multiply: [{ $subtract: ["$netBalance", 5000000] }, 0.001],
                  },
                  0,
                ],
              },
              else: 0,
            },
          },
        },
      },

      // --- Balance Required ---
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

      // --- Normalize project_kwp (unchanged logic) ---
      {
        $addFields: {
          project_kwp: {
            $let: {
              vars: {
                v: {
                  $cond: [
                    { $isNumber: "$project_kwp" },
                    "$project_kwp",
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$project_kwp", null] },
                            { $ne: ["$project_kwp", ""] },
                          ],
                        },
                        {
                          $convert: {
                            input: "$project_kwp",
                            to: "double",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
              in: {
                $cond: [
                  { $gt: ["$$v", 100] },
                  { $divide: ["$$v", 1000] },
                  "$$v",
                ],
              },
            },
          },
        },
      },

      // --- Activity dates ---
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
              {
                $max: {
                  $map: { input: "$credits", as: "c", in: "$$c.createdAt" },
                },
              },
              {
                $max: {
                  $map: { input: "$debits", as: "d", in: "$$d.updatedAt" },
                },
              },
            ],
          },
        },
      },

      // --- Projection ---
      {
        $project: {
          _id: 1,
          p_id: 1,
          code: 1,
          name: 1,
          customer: 1,
          p_group: 1,
          project_kwp: 1,
          totalCredit: 1,
          totalDebit: 1,
          totalAdjustment: 1,
          total_po_basic: 1,
          customerAdjustmentTotal: 1,
          availableAmount: 1,
          netBalance: 1,
          totalAmountPaid: 1,
          balanceSlnko: 1,
          netAdvance: 1,
          tcs: 1,
          balancePayable: 1,
          total_po_with_gst: 1,
          gst_as_po_basic: 1,
          balanceRequired: 1,
        },
      },
    ];

    const countPipeline = [...aggregationPipeline, { $count: "total" }];

    const paginatedPipeline = [
      ...aggregationPipeline,
      { $sort: { latestActivityDate: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ];

    const [data, countResult, projectTotals] = await Promise.all([
      projectModells.aggregate(paginatedPipeline),
      projectModells.aggregate(countPipeline),
      projectModells.aggregate([
        ...aggregationPipeline,
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
      ]),
    ]);

    const total = countResult[0]?.total || 0;

    res.json({
      success: true,
      meta: { total, page, pageSize, count: data.length },
      data,
      totals: projectTotals[0] || {},
    });
  } catch (error) {
    console.error("Error in projectBalance:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**** export project code ****/

const exportProjectBalance = async (req, res) => {
  const toNum = (expr) => ({
    $convert: {
      input: {
        $cond: [
          { $eq: [{ $type: expr }, "string"] },
          { $trim: { input: expr } },
          expr,
        ],
      },
      to: "double",
      onError: 0,
      onNull: 0,
    },
  });

  try {
    const { search = "", selectedIds = [] } = req.body;

    const matchConditions = [];
    if (search) {
      const regex = new RegExp(search, "i");
      matchConditions.push({ $or: [{ name: regex }, { code: regex }, { customer: regex }] });
    }
    if (selectedIds.length > 0) {
      matchConditions.push({ code: { $in: selectedIds } });
    }

    const matchStage =
      matchConditions.length > 0 ? { $match: { $and: matchConditions } } : { $match: {} };

    const aggregationPipeline = [
      matchStage,
      { $lookup: { from: "addmoneys", localField: "p_id", foreignField: "p_id", as: "credits" } },
      { $lookup: { from: "subtract moneys", localField: "p_id", foreignField: "p_id", as: "debits" } },
      { $lookup: { from: "adjustmentrequests", localField: "p_id", foreignField: "p_id", as: "adjustments" } },
      { $lookup: { from: "purchaseorders", localField: "code", foreignField: "p_id", as: "pos" } },

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
                  ],
                },
              },
            },
          ],
          as: "pays",
        },
      },

      { $lookup: { from: "biildetails", localField: "pos.po_number", foreignField: "po_number", as: "bills" } },

      // Totals derived from POs
      {
        $addFields: {
          total_po_basic: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$pos",
                    as: "po",
                    in: toNum("$$po.po_basic"),
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
                    in: toNum("$$d.gst"),
                  },
                },
              },
              2,
            ],
          },
        },
      },
      { $addFields: { total_po_with_gst: { $round: [{ $add: ["$total_po_basic", "$gst_as_po_basic"] }, 2] } } },

      // Credit / Debit / Available
      {
        $addFields: {
          totalCredit: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: toNum("$$c.cr_amount"),
                  },
                },
              },
              2,
            ],
          },
          totalDebit: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: toNum("$$d.amount_paid"),
                  },
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
                      $map: { input: "$credits", as: "c", in: toNum("$$c.cr_amount") },
                    },
                  },
                  {
                    $sum: {
                      $map: { input: "$debits", as: "d", in: toNum("$$d.amount_paid") },
                    },
                  },
                ],
              },
              2,
            ],
          },

          // Adjustments
          customerAdjustmentTotal: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: { input: "$debits", as: "d", cond: { $eq: ["$$d.paid_for", "Customer Adjustment"] } },
                    },
                    as: "d",
                    in: toNum("$$d.amount_paid"),
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
                    input: { $filter: { input: "$adjustments", as: "adj", cond: { $eq: ["$$adj.adj_type", "Add"] } } },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
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
                    input: { $filter: { input: "$adjustments", as: "adj", cond: { $eq: ["$$adj.adj_type", "Subtract"] } } },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
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
                        input: { $filter: { input: "$adjustments", as: "adj", cond: { $eq: ["$$adj.adj_type", "Add"] } } },
                        as: "a",
                        in: { $abs: toNum("$$a.adj_amount") },
                      },
                    },
                  },
                  {
                    $sum: {
                      $map: {
                        input: { $filter: { input: "$adjustments", as: "adj", cond: { $eq: ["$$adj.adj_type", "Subtract"] } } },
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

          // Paid / PO / Bills / Net Advance
          totalAmountPaid: {
            $round: [
              {
                $cond: [
                  { $gt: [{ $size: "$pays" }, 0] },
                  {
                    $sum: {
                      $map: { input: "$pays", as: "p", in: toNum("$$p.amount_paid") },
                    },
                  },
                  {
                    $sum: {
                      $map: { input: "$debits", as: "d", in: toNum("$$d.amount_paid") },
                    },
                  },
                ],
              },
              2,
            ],
          },
          totalPoValue: {
            $round: [
              {
                $sum: {
                  $map: { input: "$pos", as: "po", in: toNum("$$po.po_value") },
                },
              },
              2,
            ],
          },
          totalBillValue: {
            $round: [
              {
                $sum: {
                  $map: { input: "$bills", as: "bill", in: toNum("$$bill.bill_value") },
                },
              },
              2,
            ],
          },
          netAdvance: {
            $round: [
              {
                $subtract: [
                  { $sum: { $map: { input: "$pays", as: "pay", in: toNum("$$pay.amount_paid") } } },
                  { $sum: { $map: { input: "$bills", as: "bill", in: toNum("$$bill.bill_value") } } },
                ],
              },
              2,
            ],
          },
        },
      },

      // Net balance from credits minus customer adjustments debits
      {
        $addFields: {
          netBalance: {
            $round: [
              {
                $subtract: [
                  { $sum: { $map: { input: "$credits", as: "c", in: toNum("$$c.cr_amount") } } },
                  {
                    $sum: {
                      $map: {
                        input: { $filter: { input: "$debits", as: "d", cond: { $eq: ["$$d.paid_for", "Customer Adjustment"] } } },
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
        },
      },

      // Balances & TCS
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
                      { $sum: { $map: { input: "$bills", as: "bill", in: toNum("$$bill.bill_value") } } },
                    ],
                  },
                  {
                    $subtract: [
                      { $sum: { $map: { input: "$pays", as: "pay", in: toNum("$$pay.amount_paid") } } },
                      { $sum: { $map: { input: "$bills", as: "bill", in: toNum("$$bill.bill_value") } } },
                    ],
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
          tcs: {
            $cond: [
              { $gt: ["$netBalance", 5000000] },
              { $round: [{ $multiply: [{ $subtract: ["$netBalance", 5000000] }, 0.001] }, 0] },
              0,
            ],
          },
        },
      },
      { $addFields: { balanceRequired: { $round: [{ $subtract: [{ $subtract: ["$balanceSlnko", "$balancePayable"] }, "$tcs"] }] } } },

      // Capacity cleanup (kept as-is)
      {
        $addFields: {
          project_kwp: {
            $let: {
              vars: {
                v: {
                  $cond: [
                    { $isNumber: "$project_kwp" },
                    "$project_kwp",
                    {
                      $cond: [
                        { $and: [{ $ne: ["$project_kwp", null] }, { $ne: ["$project_kwp", ""] }] },
                        { $convert: { input: "$project_kwp", to: "double", onError: 0, onNull: 0 } },
                        0,
                      ],
                    },
                  ],
                },
              },
              in: { $cond: [{ $gt: ["$$v", 100] }, { $divide: ["$$v", 1000] }, "$$v"] },
            },
          },
        },
      },

      {
        $project: {
          _id: 1,
          projectId: "$code",
          projectName: "$name",
          clientName: "$customer",
          groupName: "$p_group",
          plantCapacity: "$project_kwp",
          totalCredit: 1,
          totalDebit: 1,
          totalAdjustment: 1,
          availableAmount: 1,
          balanceSlnko: 1,
          balancePayable: 1,
          balanceRequired: 1,
        },
      },
    ];

    const result = await projectModells.aggregate(aggregationPipeline);

    const formattedResult = result.map((item) => ({
      ...item,
      totalCredit: item.totalCredit?.toFixed(2),
      totalDebit: item.totalDebit?.toFixed(2),
      totalAdjustment: item.totalAdjustment?.toFixed(2),
      availableAmount: item.availableAmount?.toFixed(2),
      balanceSlnko: item.balanceSlnko?.toFixed(2),
      balancePayable: item.balancePayable?.toFixed(2),
      balanceRequired: item.balanceRequired?.toFixed(2),
    }));

    const fields = [
      { label: "Project Id", value: "projectId" },
      { label: "Project Name", value: "projectName" },
      { label: "Client Name", value: "clientName" },
      { label: "Group Name", value: "groupName" },
      { label: "Plant Capacity (MW AC)", value: "plantCapacity" },
      { label: "Total Credit", value: "totalCredit" },
      { label: "Total Debit", value: "totalDebit" },
      { label: "Total Adjustment", value: "totalAdjustment" },
      { label: "Amount (Old)", value: "availableAmount" },
      { label: "Balance with Slnko", value: "balanceSlnko" },
      { label: "Balance Payable to Vendors", value: "balancePayable" },
      { label: "Balance Required", value: "balanceRequired" },
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedResult);

    res.header("Content-Type", "text/csv");
    res.attachment("project-balance-export.csv");
    return res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ message: "Failed to export project balance" });
  }
};


module.exports = { projectBalance, exportProjectBalance };
