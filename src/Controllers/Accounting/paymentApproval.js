const { default: mongoose } = require("mongoose");
const payRequestModells = require("../../Modells/payRequestModells");
const User = require("../../Modells/users/userModells");
const { default: axios } = require("axios");

const paymentApproval = async function (req, res) {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const matchStage = {
      ...(search && {
        $or: [
          { code: { $regex: search, $options: "i" } },
          { pay_id: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
          { p_group: { $regex: search, $options: "i" } },
        ],
      }),
    };

    const pipeline = [
      { $match: { approved: "Pending" } },

      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
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
            {
              $group: {
                _id: null,
                totalCredit: { $sum: { $toDouble: "$cr_amount" } },
              },
            },
          ],
          as: "creditData",
        },
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { pid: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pid"] } } },
            {
              $group: {
                _id: null,
                totalDebit: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "debitData",
        },
      },
      {
        $addFields: {
          Available_Amount: {
            $round: [
              {
                $subtract: [
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$creditData.totalCredit", 0] },
                      0,
                    ],
                  },
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$debitData.totalDebit", 0] },
                      0,
                    ],
                  },
                ],
              },
            ],
          },
          trimmedGroup: {
            $trim: {
              input: "$project.p_group",
            },
          },
        },
      },
      {
        $lookup: {
          from: "payrequests",
          let: { pid: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$p_id", "$$pid"] },
                    {
                      $or: [
                        { $eq: ["$approved", "Approved"] },
                        {
                          $and: [
                            { $eq: ["$approved", "Pending"] },
                            { $eq: ["$approval_status.stage", "Account"] },
                          ],
                        },
                      ],
                    },
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
          as: "creditBalanceData",
        },
      },
      {
        $addFields: {
          creditBalance: {
            $round: [
              {
                $subtract: [
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$creditData.totalCredit", 0] },
                      0,
                    ],
                  },
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$creditBalanceData.totalPaid", 0] },
                      0,
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
        $lookup: {
          from: "users",
          localField: "credit.user_id",
          foreignField: "_id",
          as: "creditUser",
        },
      },
      {
        $unwind: {
          path: "$creditUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $addFields: {
          hasValidGroup: {
            $cond: [
              {
                $or: [
                  { $eq: ["$trimmedGroup", ""] },
                  { $eq: ["$trimmedGroup", null] },
                ],
              },
              false,
              true,
            ],
          },
        },
      },

      // Conditionally lookup group project IDs
      {
        $lookup: {
          from: "projectdetails",
          let: { grp: "$trimmedGroup" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_group", "$$grp"] } } },
            { $project: { p_id: 1, _id: 0 } },
          ],
          as: "groupProjects",
        },
      },
      {
        $addFields: {
          groupProjectIds: {
            $cond: [
              "$hasValidGroup",
              { $map: { input: "$groupProjects", as: "gp", in: "$$gp.p_id" } },
              [],
            ],
          },
        },
      },

      // Lookup group credits
      {
        $lookup: {
          from: "addmoneys",
          let: { gids: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$gids"] } } },
            {
              $group: {
                _id: null,
                totalGroupCredit: { $sum: { $toDouble: "$cr_amount" } },
              },
            },
          ],
          as: "groupCreditData",
        },
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { gids: "$groupProjectIds" },
          pipeline: [
            { $match: { $expr: { $in: ["$p_id", "$$gids"] } } },
            {
              $group: {
                _id: null,
                totalGroupDebit: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "groupDebitData",
        },
      },

      {
        $addFields: {
          groupBalance: {
            $cond: [
              "$hasValidGroup",
              {
                $subtract: [
                  {
                    $ifNull: [
                      {
                        $arrayElemAt: ["$groupCreditData.totalGroupCredit", 0],
                      },
                      0,
                    ],
                  },
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$groupDebitData.totalGroupDebit", 0] },
                      0,
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
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
          groupBalance: 1,
          vendor: 1,
          credit_extension: "$credit.credit_extension",
          credit_remarks: "$credit.credit_remarks",
          credit_user_name: "$creditUser.name",
          totalCredited: { $arrayElemAt: ["$creditData.totalCredit", 0] },
          totalPaid: { $arrayElemAt: ["$creditBalanceData.totalPaid", 0] },
          creditBalance: 1,
        },
      },
    ];

    const countPipeline = [...pipeline, { $count: "total" }];
    const paginatedPipeline = [
      ...pipeline,
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ];

    const [data, countResult] = await Promise.all([
      payRequestModells.aggregate(paginatedPipeline),
      payRequestModells.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    let toBeApprovedCount = 0;
    let overdueCount = 0;
    let instantCount = 0;
    let creditCount = 0;

    if (currentUser.department === "Accounts") {
      const now = new Date();

      const rd = {
        $dateDiff: {
          startDate: "$$NOW",
          endDate: { $toDate: "$credit.credit_deadline" },
          unit: "day",
        },
      };

      const matchWithSearch = (extra) => ({
        ...accessFilter,
        ...extra,
        ...(Object.keys(searchFilter).length ? searchFilter : {}),
      });

      const toBeApprovedMatch = matchWithSearch({
        cr_id: { $exists: true, $ne: null },

        "approval_status.stage": "Account",
        // { "approval_status.stage": "Credit Pending" },

        "credit.credit_deadline": { $ne: null },
        $expr: { $and: [{ $gte: [rd, 0] }, { $lte: [rd, 2] }] },
      });

      const overdueMatch = matchWithSearch({
        cr_id: { $exists: true, $ne: null },
        "credit.credit_deadline": { $ne: null },
        $expr: { $lt: [rd, 0] },
      });

      const creditMatch = matchWithSearch({
        cr_id: { $exists: true, $ne: null },

        "approval_status.stage": "Account",

        "credit.credit_deadline": { $ne: null },
        $expr: { $gt: [rd, 2] },
      });

      const instantMatch = matchWithSearch({
        cr_id: { $in: [null, ""] },
        pay_id: { $exists: true, $ne: null },
        "approval_status.stage": "Account",
      });

      const [toBeApprovedResult, overdueResult, creditResult, instantResult] =
        await Promise.all([
          payRequestModells.aggregate([
            { $match: toBeApprovedMatch },
            { $count: "count" },
          ]),
          payRequestModells.aggregate([
            { $match: overdueMatch },
            { $count: "count" },
          ]),
          payRequestModells.aggregate([
            { $match: creditMatch },
            { $count: "count" },
          ]),
          payRequestModells.aggregate([
            { $match: instantMatch },
            { $count: "count" },
          ]),
        ]);

      toBeApprovedCount = toBeApprovedResult[0]?.count || 0;
      overdueCount = overdueResult[0]?.count || 0;
      creditCount = creditResult[0]?.count || 0;
      instantCount = instantResult[0]?.count || 0;
    }

    res.json({
      success: true,
      meta: {
        total,
        page,
        pageSize,
        count: data.length,
      },
      data,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred while processing the request." });
  }
};

const getPoApprovalPdf = async function (req, res) {
  try {
    const { poIds } = req.body;

    if (!Array.isArray(poIds) || poIds.length === 0) {
      return res.status(400).json({ message: "No PO Provided." });
    }

    const validPoIds = poIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (validPoIds.length === 0) {
      return res.status(400).json({ message: "Invalid PO IDs provided." });
    }

    const pipeline = [
      {
        $match: {
          _id: { $in: validPoIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project_info",
        },
      },
      {
        $unwind: {
          path: "$project_info",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          project_code: "$project_info.code",
          project_name: "$project_info.name",
          group_name: "$project_info.p_group",
          pay_id: { $ifNull: ["$pay_id", "$cr_id"] },
          paid_for: 1,
          vendor: 1,
          dbt_date: 1,
          comment: 1,
          amt_for_customer: 1,
        },
      },
    ];

    const result = await payRequestModells.aggregate(pipeline);

    const apiUrl = `${process.env.PDF_PORT}/po-approve/po-pdf`;

    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        Pos: result,
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Po-Approval.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (error) {
    console.error("Error generating PO approval PDF:", error);
    res
      .status(500)
      .json({ message: "Error Fetching PDF", error: error.message });
  }
};

module.exports = {
  paymentApproval,
  getPoApprovalPdf,
};
