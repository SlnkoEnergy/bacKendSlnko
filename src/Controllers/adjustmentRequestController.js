const adjustmentRequestModells = require("../models/adjustmentRequestModells");  
const projectModel = require("../models/project.model");
const projectBalanceModel = require("../models/projectBalance.model");


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
      totalAmountPaid: {
        $round: [{ $ifNull: ["$paidAmount", 0] }, 2],
      },
      balancePayable: {
        $round: [
          {
            $subtract: [
              { $ifNull: ["$total_po_with_gst", 0] }, // always fallback 0
              { $ifNull: ["$paidAmount", 0] }, // always fallback 0
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

async function recomputeProjectBalanceForPo(pid) {
  const pidNum = Number(pid);
  if (!pidNum) return; // skip if invalid

  const project = await projectModel.findOne({ p_id: pidNum }, { _id: 1 }).lean();
  if (!project) return;

  const rows = await projectModel.aggregate([
    { $match: { p_id: pidNum } },
    ...aggregationPipeline,
  ]);

  if (!rows.length) return;
  const r = rows[0];

  await projectBalanceModel.updateOne(
    { p_id: project._id },
    {
      $set: {
        p_id: project._id,
        totalCredited:   r.totalCredit     || 0,
        totalDebited:    r.totalDebit      || 0,
        amountAvailable: r.availableAmount || 0,
        totalAdjustment: r.totalAdjustment || 0,
        balanceSlnko:    r.balanceSlnko    || 0,
        balancePayable:  r.balancePayable  || 0,
        balanceRequired: r.balanceRequired || 0,
      },
    },
    { upsert: true }
  );
};
//add adjustment request
const addAdjustmentRequest = async (req, res) => {
  try {
    const {
      p_id,
      pay_id,
      name,
      customer,
      p_group,
      pay_type,
      amount_paid,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      adj_type,
      adj_amount,
      remark,
      adj_date,
      submitted_by,
      comment,
    } = req.body;

    if (!p_id) {
      return res.status(400).json({ message: "p_id is required" });
    }

    if (!adj_type || !["Add", "Subtract"].includes(adj_type)) {
      return res.status(400).json({ message: "adj_type must be Add or Subtract" });
    }

    if (isNaN(Number(adj_amount))) {
      return res.status(400).json({ message: "adj_amount must be a valid number" });
    }

    
    const adjustmentRequest = new adjustmentRequestModells({
      p_id,
      pay_id,
      name,
      customer,
      p_group,
      pay_type,
      amount_paid,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      adj_type,
      adj_amount,
      remark,
      adj_date: adj_date || new Date(),
      submitted_by,
      comment,
    });

    await adjustmentRequest.save();

    await recomputeProjectBalanceForPo(p_id);

    res.status(201).json({
      message: "Adjustment request added successfully",
      adjustmentRequest,
    });
  } catch (error) {
    console.error("addAdjustmentRequest error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

//get all adjustment request

const getAdjustmentRequest = async (req, res) => {
    try {
        const adjustmentRequests = await adjustmentRequestModells.find();
        res.status(200).json(adjustmentRequests);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

//Delete adjustment request

const deleteAdjustmentRequest = async (req, res) => {
    try {
        const { _id } = req.params;
        const adjustmentRequest = await adjustmentRequestModells.findByIdAndDelete(_id);
        if (!adjustmentRequest) {
            return res.status(404).json({ message: "Adjustment request not found" });
        }
        res.status(200).json({ message: "Adjustment request deleted successfully" ,data:adjustmentRequest});
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    addAdjustmentRequest,
    getAdjustmentRequest,
    deleteAdjustmentRequest
};

