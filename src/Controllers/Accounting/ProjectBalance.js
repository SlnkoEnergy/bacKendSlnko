const projectModells = require("../../Modells/projectModells");
const { Parser } = require("json2csv");

const projectBalance = async (req, res) => {
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
          totalCredit: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: { $toDouble: "$$c.cr_amount" },
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
                    in: { $toDouble: "$$d.amount_paid" },
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
                        in: { $toDouble: "$$c.cr_amount" },
                      },
                    },
                  },
                  {
                    $sum: {
                      $map: {
                        input: "$debits",
                        as: "d",
                        in: { $toDouble: "$$d.amount_paid" },
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
                    in: { $toDouble: "$$d.amount_paid" },
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
                    in: { $abs: { $toDouble: "$$a.adj_amount" } },
                  },
                },
              },
              2,
            ],
          },
          netBalance: {
            $round: [
              {
                $subtract: [
                  {
                    $sum: {
                      $map: {
                        input: "$credits",
                        as: "c",
                        in: { $toDouble: "$$c.cr_amount" },
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
                        in: { $toDouble: "$$d.amount_paid" },
                      },
                    },
                  },
                ],
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
                    in: { $abs: { $toDouble: "$$a.adj_amount" } },
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
                        in: { $abs: { $toDouble: "$$a.adj_amount" } },
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
                        in: { $abs: { $toDouble: "$$a.adj_amount" } },
                      },
                    },
                  },
                ],
              },
              2,
            ],
          },
          totalAmountPaid: {
            $round: [
              {
                $sum: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: { $toDouble: "$$d.amount_paid" },
                  },
                },
              },
              2,
            ],
          },

          balanceSlnko: {
            $round: [
              {
                $sum: [
                  {
                    $subtract: [
                      {
                        $subtract: [
                          {
                            $sum: {
                              $map: {
                                input: "$credits",
                                as: "c",
                                in: { $toDouble: "$$c.cr_amount" },
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
                                      $eq: [
                                        "$$d.paid_for",
                                        "Customer Adjustment",
                                      ],
                                    },
                                  },
                                },
                                as: "d",
                                in: { $toDouble: "$$d.amount_paid" },
                              },
                            },
                          },
                        ],
                      },
                      {
                        $sum: {
                          $map: {
                            input: "$pays",
                            as: "pay",
                            in: { $toDouble: "$$pay.amount_paid" },
                          },
                        },
                      },
                    ],
                  },
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
                            in: { $abs: { $toDouble: "$$a.adj_amount" } },
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
                            in: { $abs: { $toDouble: "$$a.adj_amount" } },
                          },
                        },
                      },
                    ],
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
                    in: { $toDouble: "$$po.po_value" },
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
                    in: { $toDouble: "$$bill.bill_value" },
                  },
                },
              },
              2,
            ],
          },
          netAdvance: {
            $round: [
              {
                $subtract: [
                  {
                    $sum: {
                      $map: {
                        input: "$pays",
                        as: "pay",
                        in: { $toDouble: "$$pay.amount_paid" },
                      },
                    },
                  },
                  {
                    $sum: {
                      $map: {
                        input: "$bills",
                        as: "bill",
                        in: { $toDouble: "$$bill.bill_value" },
                      },
                    },
                  },
                ],
              },
              2,
            ],
          },
          balancePayable: {
            $round: [
              {
                $subtract: [
                  {
                    $subtract: [
                      {
                        $sum: {
                          $map: {
                            input: "$pos",
                            as: "po",
                            in: { $toDouble: "$$po.po_value" },
                          },
                        },
                      },
                      {
                        $sum: {
                          $map: {
                            input: "$bills",
                            as: "bill",
                            in: { $toDouble: "$$bill.bill_value" },
                          },
                        },
                      },
                    ],
                  },
                  {
                    $subtract: [
                      {
                        $sum: {
                          $map: {
                            input: "$pays",
                            as: "pay",
                            in: { $toDouble: "$$pay.amount_paid" },
                          },
                        },
                      },
                      {
                        $sum: {
                          $map: {
                            input: "$bills",
                            as: "bill",
                            in: { $toDouble: "$$bill.bill_value" },
                          },
                        },
                      },
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
      {
        $addFields: {
          balanceRequired: {
            $round: [
              {
                $subtract: [
                  {
                    $subtract: [
                      {
                        $sum: [
                          {
                            $subtract: [
                              {
                                $subtract: [
                                  {
                                    $sum: {
                                      $map: {
                                        input: "$credits",
                                        as: "c",
                                        in: { $toDouble: "$$c.cr_amount" },
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
                                              $eq: [
                                                "$$d.paid_for",
                                                "Customer Adjustment",
                                              ],
                                            },
                                          },
                                        },
                                        as: "d",
                                        in: { $toDouble: "$$d.amount_paid" },
                                      },
                                    },
                                  },
                                ],
                              },
                              {
                                $sum: {
                                  $map: {
                                    input: "$pays",
                                    as: "pay",
                                    in: { $toDouble: "$$pay.amount_paid" },
                                  },
                                },
                              },
                            ],
                          },
                          {
                            $subtract: [
                              {
                                $sum: {
                                  $map: {
                                    input: {
                                      $filter: {
                                        input: "$adjustments",
                                        as: "adj",
                                        cond: {
                                          $eq: ["$$adj.adj_type", "Add"],
                                        },
                                      },
                                    },
                                    as: "a",
                                    in: {
                                      $abs: { $toDouble: "$$a.adj_amount" },
                                    },
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
                                        cond: {
                                          $eq: ["$$adj.adj_type", "Subtract"],
                                        },
                                      },
                                    },
                                    as: "a",
                                    in: {
                                      $abs: { $toDouble: "$$a.adj_amount" },
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        ],
                      },
                      {
                        $subtract: [
                          {
                            $subtract: [
                              {
                                $sum: {
                                  $map: {
                                    input: "$pos",
                                    as: "po",
                                    in: { $toDouble: "$$po.po_value" },
                                  },
                                },
                              },
                              {
                                $sum: {
                                  $map: {
                                    input: "$bills",
                                    as: "bill",
                                    in: { $toDouble: "$$bill.bill_value" },
                                  },
                                },
                              },
                            ],
                          },
                          {
                            $subtract: [
                              {
                                $sum: {
                                  $map: {
                                    input: "$pays",
                                    as: "pay",
                                    in: { $toDouble: "$$pay.amount_paid" },
                                  },
                                },
                              },
                              {
                                $sum: {
                                  $map: {
                                    input: "$bills",
                                    as: "bill",
                                    in: { $toDouble: "$$bill.bill_value" },
                                  },
                                },
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    $cond: {
                      if: { $gt: ["$netBalance", 5000000] },
                      then: {
                        $round: [
                          {
                            $multiply: [
                              { $subtract: ["$netBalance", 5000000] },
                              0.001,
                            ],
                          },
                          0,
                        ],
                      },
                      else: 0,
                    },
                  },
                ],
              },
              2, // round final result to 2 decimal places
            ],
          },
        },
      },
      {
        $addFields: {
          latestCreditCreatedAt: {
            $max: {
              $map: {
                input: "$credits",
                as: "c",
                in: "$$c.createdAt",
              },
            },
          },
          latestDebitUpdatedAt: {
            $max: {
              $map: {
                input: "$debits",
                as: "d",
                in: "$$d.updatedAt",
              },
            },
          },
          latestActivityDate: {
            $max: [
              {
                $max: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: "$$c.createdAt",
                  },
                },
              },
              {
                $max: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: "$$d.updatedAt",
                  },
                },
              },
            ],
          },
        },
      },
      
      

      {
        $project: {
          p_id: 1,
          code: 1,
          name: 1,
          customer: 1,
          p_group: 1,
          project_kwp: 1,
          totalCredit: 1,
          totalDebit: 1,
          totalAdjustment: 1,
          customerAdjustmentTotal: 1,
          availableAmount: 1,
          netBalance: 1,
          totalAmountPaid: 1,
          balanceSlnko: 1,

          balancePayable: 1,

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
            totalProjectKwp: {
              $sum: {
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
                      { $toDouble: "$project_kwp" },
                      0,
                    ],
                  },
                ],
              },
            },
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
            _id: 0,
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

      meta: {
        total,
        page,
        pageSize,
        count: data.length,
      },
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
  try {
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
            $sum: {
              $map: {
                input: { $ifNull: ["$credits", []] },
                as: "c",
                in: { $toDouble: "$$c.cr_amount" },
              },
            },
          },
          totalDebit: {
            $sum: {
              $map: {
                input: { $ifNull: ["$debits", []] },
                as: "d",
                in: { $toDouble: "$$d.amount_paid" },
              },
            },
          },
          totalAdjustment: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: ["$adjustments", []] },
                        as: "adj",
                        cond: { $eq: ["$$adj.adj_type", "Add"] },
                      },
                    },
                    as: "a",
                    in: { $abs: { $toDouble: "$$a.adj_amount" } },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: ["$adjustments", []] },
                        as: "adj",
                        cond: { $eq: ["$$adj.adj_type", "Subtract"] },
                      },
                    },
                    as: "a",
                    in: { $abs: { $toDouble: "$$a.adj_amount" } },
                  },
                },
              },
            ],
          },
          amountOld: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$credits", []] },
                    as: "c",
                    in: { $toDouble: "$$c.cr_amount" },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$debits", []] },
                    as: "d",
                    in: {
                      $cond: [
                        { $eq: ["$$d.paid_for", "Customer Adjustment"] },
                        { $toDouble: "$$d.amount_paid" },
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
          balanceWithSlnko: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$pos", []] },
                    as: "po",
                    in: { $toDouble: "$$po.po_value" },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$bills", []] },
                    as: "bill",
                    in: { $toDouble: "$$bill.bill_value" },
                  },
                },
              },
            ],
          },
          balancePayableToVendors: {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$bills", []] },
                    as: "bill",
                    in: { $toDouble: "$$bill.bill_value" },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$pays", []] },
                    as: "pay",
                    in: { $toDouble: "$$pay.amount_paid" },
                  },
                },
              },
            ],
          },
        },
      },
      {
        $addFields: {
          balanceRequired: {
            $subtract: [
              {
                $add: ["$totalCredit", "$totalAdjustment", "$amountOld"],
              },
              {
                $add: [
                  "$balanceWithSlnko",
                  "$balancePayableToVendors",
                  {
                    $cond: {
                      if: { $gt: ["$netBalance", 5000000] },
                      then: {
                        $round: [
                          {
                            $multiply: [
                              { $subtract: ["$netBalance", 5000000] },
                              0.001,
                            ],
                          },
                          0,
                        ],
                      },
                      else: 0,
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          projectId: "$code",
          projectName: "$name",
          clientName: "$customer",
          groupName: "$group",
          plantCapacity: "$project_kwp",
          totalCredit: 1,
          totalDebit: 1,
          totalAdjustment: 1,
          amountOld: 1,
          balanceWithSlnko: 1,
          balancePayableToVendors: 1,
          balanceRequired: 1,
        },
      },
    ];

    const result = await projectModells.aggregate(aggregationPipeline);

    const fields = [
      { label: "Project Id", value: "projectId" },
      { label: "Project Name", value: "projectName" },
      { label: "Client Name", value: "clientName" },
      { label: "Group Name", value: "groupName" },
      { label: "Plant Capacity (MW AC)", value: "plantCapacity" },
      { label: "Total Credit", value: "totalCredit" },
      { label: "Total Debit", value: "totalDebit" },
      { label: "Total Adjustment", value: "totalAdjustment" },
      { label: "Amount Amount(Old)", value: "amountOld" },
      { label: "Balance with SLnko", value: "balanceWithSlnko" },
      { label: "Balance Payable to Vendors", value: "balancePayableToVendors" },
      { label: "Balance Required", value: "balanceRequired" },
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(result);

    res.header("Content-Type", "text/csv");
    res.attachment("project-balance-export.csv");
    return res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ message: "Failed to export project balance" });
  }
};

module.exports = { projectBalance, exportProjectBalance };
