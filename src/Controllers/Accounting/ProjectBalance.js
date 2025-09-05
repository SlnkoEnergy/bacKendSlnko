const projectModells = require("../../Modells/project.model");
const { Parser } = require("json2csv");
const { runProjectBalance } = require("../../utils/projectBalanceService");
const { withPrefix, getNamespaceVersion } = require("../../utils/cache");

const NS = "pb:projectBalance";
const cache = withPrefix(NS);
const TTL = Number(process.env.REDIS_PB_TTL || process.env.REDIS_TTL_SECONDS || 120);

const norm = (v) => String(v || "").trim().toLowerCase();
const buildKey = (ver, { page, pageSize, search, group }) =>
  `v=${ver}|page=${page}|size=${pageSize}|search=${encodeURIComponent(norm(search))}|group=${encodeURIComponent(norm(group))}`;

async function projectBalance(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 10, 1);
    const search = (req.query.search || "").trim();
    const group  = (req.query.group  || "").trim();

    const ver = await getNamespaceVersion(NS);
    const key = buildKey(ver, { page, pageSize, search, group });

    const cached = await cache.get(key);
    if (cached) return res.json({ ...cached, _cache: { hit: true, key } });

    const payload = await runProjectBalance({ page, pageSize, search, group });
    await cache.set(key, payload, TTL);
    return res.json({ ...payload, _cache: { hit: false, key, ttl: TTL } });
  } catch (e) {
    console.error("projectBalance error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

/**** export project code ****/
const exportProjectBalance = async (req, res) => {
  try {
    const { search = "", selectedIds = [] } = req.body;

    const matchConditions = [];

    if (search) {
      const regex = new RegExp(search, "i");
      matchConditions.push({
        $or: [{ name: regex }, { code: regex }, { customer: regex }],
      });
    }

    if (selectedIds.length > 0) {
      matchConditions.push({ code: { $in: selectedIds } });
    }

    const matchStage =
      matchConditions.length > 0
        ? { $match: { $and: matchConditions } }
        : { $match: {} };

    const aggregationPipeline = [
      matchStage,
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
          balancePayable: {
            $round: [
              {
                $subtract: [
                  {
                    $subtract: [
                      { $ifNull: ["$total_po_with_gst", 0] },
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
                  { $subtract: ["$balanceSlnko", "$balancePayable"] },
                  "$tcs",
                ],
              },
            ],
          },
        },
      },

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
