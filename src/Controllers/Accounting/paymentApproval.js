const payRequestModells = require("../../Modells/payRequestModells");


const paymentApproval = async function (req, res) {
  try {
    const searchProjectId = req.query.code || '';
    const searchClientName = req.query.name || '';
    const searchGroupName = req.query.p_group || '';

    // Build conditional matchStage only if filters are provided
    const matchStage = {};
    if (searchProjectId) {
      matchStage["project.code"] = { $regex: searchProjectId, $options: 'i' };
    }
    if (searchClientName) {
      matchStage["project.name"] = { $regex: searchClientName, $options: 'i' };
    }
    if (searchGroupName) {
      matchStage["project.p_group"] = { $regex: searchGroupName, $options: 'i' };
    }

    const pipeline = [
      // 1️⃣ Filter only pending approvals
      {
        $match: {
          approved: "Pending",
        }
      },

      // 2️⃣ Lookup project details
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project"
        }
      },
      {
        $unwind: {
          path: "$project",
          preserveNullAndEmptyArrays: true
        }
      },

      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),

     
      {
        $lookup: {
          from: "addmoneys",
          let: { projectId: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$projectId"] } } },
            {
              $group: {
                _id: "$p_id",
                totalCredit: { $sum: { $toDouble: "$cr_amount" } }
              }
            }
          ],
          as: "creditData"
        }
      },
      {
        $unwind: {
          path: "$creditData",
          preserveNullAndEmptyArrays: true
        }
      },

      // 5️⃣ Lookup total debits per project
      {
        $lookup: {
          from: "subtract moneys",
          let: { projectId: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$projectId"] } } },
            {
              $group: {
                _id: "$p_id",
                totalDebit: { $sum: { $toDouble: "$amount_paid" } }
              }
            }
          ],
          as: "debitData"
        }
      },
      {
        $unwind: {
          path: "$debitData",
          preserveNullAndEmptyArrays: true
        }
      },

      // 6️⃣ Add Available_Amount per project
      {
        $addFields: {
          aggregateCredit: { $ifNull: ["$creditData.totalCredit", 0] },
          aggregateDebit: { $ifNull: ["$debitData.totalDebit", 0] },
          Available_Amount: {
            $subtract: [
              { $ifNull: ["$creditData.totalCredit", 0] },
              { $ifNull: ["$debitData.totalDebit", 0] }
            ]
          }
        }
      },

      // 7️⃣ Lookup group project IDs
      {
        $lookup: {
          from: "projectdetails",
          let: { groupName: "$project.p_group" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_group", "$$groupName"] } } },
            { $project: { p_id: 1, _id: 0 } }
          ],
          as: "groupProjects"
        }
      },
      {
        $addFields: {
          groupProjectIds: {
            $map: {
              input: "$groupProjects",
              as: "gp",
              in: "$$gp.p_id"
            }
          }
        }
      },

      // 8️⃣ Lookup group credit total
      {
        $lookup: {
          from: "addmoneys",
          let: { groupProjectIds: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$groupProjectIds"] } } },
            {
              $group: {
                _id: null,
                totalGroupCredit: { $sum: { $toDouble: "$cr_amount" } }
              }
            }
          ],
          as: "groupCreditData"
        }
      },
      {
        $unwind: {
          path: "$groupCreditData",
          preserveNullAndEmptyArrays: true
        }
      },

      // 9️⃣ Lookup group debit total
      {
        $lookup: {
          from: "subtract moneys",
          let: { groupProjectIds: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$groupProjectIds"] } } },
            {
              $group: {
                _id: null,
                totalGroupDebit: { $sum: { $toDouble: "$amount_paid" } }
              }
            }
          ],
          as: "groupDebitData"
        }
      },
      {
        $unwind: {
          path: "$groupDebitData",
          preserveNullAndEmptyArrays: true
        }
      },

      // 🔟 Add group balance
      {
        $addFields: {
          groupCredit: { $ifNull: ["$groupCreditData.totalGroupCredit", 0] },
          groupDebit: { $ifNull: ["$groupDebitData.totalGroupDebit", 0] },
          groupBalance: {
            $subtract: [
              { $ifNull: ["$groupCreditData.totalGroupCredit", 0] },
              { $ifNull: ["$groupDebitData.totalGroupDebit", 0] }
            ]
          }
        }
      },

      // 🔚 Final projection
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
          groupBalance: "$groupBalance"
        }
      }
    ];

    // Execute main data query
    const data = await payRequestModells.aggregate(pipeline);

    // Total count without pagination
    const totalCountPipeline = [...pipeline, { $count: "total" }];
    const totalCountResult = await payRequestModells.aggregate(totalCountPipeline);
    const totalCount = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    // Send final response
    res.json({
      totalCount,
      data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred while processing the request." });
  }
};


module.exports = {
  paymentApproval
};
