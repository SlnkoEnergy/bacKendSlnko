const payRequestModells = require("../../Modells/payRequestModells");


const paymentApproval = async function (req, res) {
   try {
    const {
      code: searchProjectId = '',
      name: searchClientName = '',
      p_group: searchGroupName = '',
    } = req.query;

    const matchStage = {};
    if (searchProjectId) matchStage["project.code"] = { $regex: searchProjectId, $options: 'i' };
    if (searchClientName) matchStage["project.name"] = { $regex: searchClientName, $options: 'i' };
    if (searchGroupName) matchStage["project.p_group"] = { $regex: searchGroupName, $options: 'i' };

    const pipeline = [
      { $match: { approved: "Pending" } },

      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project"
        }
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),

      // Calculate individual project balance
      {
        $lookup: {
          from: "addmoneys",
          let: { pid: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pid"] } } },
            { $group: { _id: null, totalCredit: { $sum: { $toDouble: "$cr_amount" } } } }
          ],
          as: "creditData"
        }
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { pid: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pid"] } } },
            { $group: { _id: null, totalDebit: { $sum: { $toDouble: "$amount_paid" } } } }
          ],
          as: "debitData"
        }
      },
      {
        $addFields: {
          Available_Amount: {
            $subtract: [
              { $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0] },
              { $ifNull: [{ $arrayElemAt: ["$debitData.totalDebit", 0] }, 0] }
            ]
          },
          trimmedGroup: {
            $trim: {
              input: "$project.p_group"
            }
          }
        }
      },

      {
        $addFields: {
          hasValidGroup: {
            $cond: [
              { $or: [{ $eq: ["$trimmedGroup", ""] }, { $eq: ["$trimmedGroup", null] }] },
              false,
              true
            ]
          }
        }
      },

      // Conditionally lookup group project IDs
      {
        $lookup: {
          from: "projectdetails",
          let: { grp: "$trimmedGroup" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_group", "$$grp"] } } },
            { $project: { p_id: 1, _id: 0 } }
          ],
          as: "groupProjects"
        }
      },
      {
        $addFields: {
          groupProjectIds: {
            $cond: [
              "$hasValidGroup",
              { $map: { input: "$groupProjects", as: "gp", in: "$$gp.p_id" } },
              []
            ]
          }
        }
      },

      // Lookup group credits
      {
        $lookup: {
          from: "addmoneys",
          let: { gids: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$gids"] } } },
            { $group: { _id: null, totalGroupCredit: { $sum: { $toDouble: "$cr_amount" } } } }
          ],
          as: "groupCreditData"
        }
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { gids: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$gids"] } } },
            { $group: { _id: null, totalGroupDebit: { $sum: { $toDouble: "$amount_paid" } } } }
          ],
          as: "groupDebitData"
        }
      },

      {
        $addFields: {
          groupBalance: {
            $cond: [
              "$hasValidGroup",
              {
                $subtract: [
                  { $ifNull: [{ $arrayElemAt: ["$groupCreditData.totalGroupCredit", 0] }, 0] },
                  { $ifNull: [{ $arrayElemAt: ["$groupDebitData.totalGroupDebit", 0] }, 0] }
                ]
              },
              0
            ]
          }
        }
      },

      {
        $project: {
          _id: 0,
          payment_id: "$pay_id",
          request_date: "$dbt_date",
          request_for: "$paid_for",
          payment_description: "$comment",
          amount_requested: "$amt_for_customer",
          project_id: "$project.code",
          client_name: "$project.name",
          group_name: "$project.p_group",
          ClientBalance: "$Available_Amount",
          groupBalance: 1
        }
      }
    ];

    const data = await payRequestModells.aggregate(pipeline);
    res.json({ totalCount: data.length, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred while processing the request." });
  }
};


module.exports = {
  paymentApproval
};
