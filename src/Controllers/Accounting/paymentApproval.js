const { default: mongoose } = require("mongoose");
const payRequestModells = require("../../Modells/payRequestModells");
const User = require("../../Modells/users/userModells");
const { default: axios } = require("axios");

const paymentApproval = async function (req, res) {
  try {
    const search = req.query.search || "";
    const tab = req.query.tab || "";
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Search filter
    const searchFilter = search
      ? {
          $or: [
            { code: { $regex: search, $options: "i" } },
            { pay_id: { $regex: search, $options: "i" } },
            { cr_id: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { p_group: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // Department-based access filter
    let accessFilter = {};
    if (currentUser.department === "SCM" && currentUser.role === "manager") {
      accessFilter = {
        approved: "Pending",
        $or: [
          { "approval_status.stage": "Credit Pending" },
          { "approval_status.stage": "Draft" },
        ],
      };
    } else if (
      currentUser.department === "Internal" &&
      currentUser.role === "manager"
    ) {
      accessFilter = {
        approved: "Pending",
        "approval_status.stage": "CAM",
      };
    } else if (
      currentUser.department === "Accounts" &&
      currentUser.role === "manager"
    ) {
      accessFilter = {
        approved: "Pending",
        // "approval_status.stage": "Account",
        $or: [
          { "approval_status.stage": "Credit Pending" },
          { "approval_status.stage": "Account" },
        ],
      };
    } else {
      return res.status(200).json({
        totalCount: 0,
        totalPages: 0,
        currentPage: 1,
        data: [],
        message: "You are not authorized to view approvals.",
      });
    }

    const now = new Date();
    let tabFilter = {};

    // Only Accounts department uses tab filters
    if (currentUser.department === "Accounts") {
      switch (tab) {
        case "credit":
          tabFilter = {
            cr_id: { $exists: true, $ne: null },
            "approval_status.stage": "Credit Pending",
          };
          break;
        case "instant":
          tabFilter = {
            cr_id: { $in: [null, ""] },
            pay_id: { $exists: true, $ne: null },
            "approval_status.stage": "Account",
          };
          break;
        case "toBeApproved":
          tabFilter = {
            "credit.credit_deadline": {
              $exists: true,
              $ne: null,
              $gte: now,
              $lte: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
            },
          };
          break;
        case "overdue":
          tabFilter = {
            "credit.credit_deadline": {
              $exists: true,
              $ne: null,
              $lt: now,
            },
          };
          break;
      }
    }

    const combinedMatch = { ...accessFilter, ...tabFilter };

    // Common aggregation pipeline
    const pipeline = [
      { $match: combinedMatch },
      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),

      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      // Available amount (Credit - Debit)
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
          from: "subtract moneys", // fixed collection name
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
              2,
            ],
          },
          trimmedGroup: { $trim: { input: "$project.p_group" } },
        },
      },

      // Group-level balance
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
        $addFields: {
          remainingDays: {
            $cond: [
              {
                $and: [
                  { $ne: ["$credit.credit_deadline", null] },
                  { $ne: ["$dbt_date", null] },
                ],
              },
              {
                $dateDiff: {
                  startDate: { $toDate: "$dbt_date" },
                  endDate: { $toDate: "$credit.credit_deadline" },
                  unit: "day",
                },
              },
              null,
            ],
          },
        },
      },

      {
        $project: {
          _id: 1,
          pay_id: "$pay_id",
          cr_id: "$cr_id",
          request_date: "$dbt_date",
          request_for: "$paid_for",
          payment_description: "$comment",
          amount_requested: "$amt_for_customer",
          project_id: "$project.code",
          client_name: "$project.name",
          group_name: "$project.p_group",
          ClientBalance: "$Available_Amount",
          groupBalance: 1,
          remainingDays: 1,
          credit_deadline: "$credit.credit_deadline",
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

      // Prepare a helper to merge filters
      const matchWithSearch = (extraFilter) => ({
        ...accessFilter,
        ...extraFilter,
        ...(Object.keys(searchFilter).length ? searchFilter : {}),
      });

      // Build all tab counts with search included
      const [toBeApprovedResult, overdueResult, creditResult, instantResult] =
        await Promise.all([
          // To Be Approved
          payRequestModells.aggregate([
            {
              $match: matchWithSearch({
                "credit.credit_deadline": {
                  $gte: now,
                  $lte: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
                },
              }),
            },
            { $count: "count" },
          ]),

          // Overdue
          payRequestModells.aggregate([
            {
              $match: matchWithSearch({
                "credit.credit_deadline": { $lt: now },
              }),
            },
            { $count: "count" },
          ]),

          // Credit
          payRequestModells.aggregate([
            {
              $match: matchWithSearch({
                cr_id: { $exists: true, $ne: null },
                "approval_status.stage": "Credit Pending",
              }),
            },
            { $count: "count" },
          ]),

          // Instant
          payRequestModells.aggregate([
            {
              $match: matchWithSearch({
                cr_id: { $in: [null, ""] },
                pay_id: { $exists: true, $ne: null },
                "approval_status.stage": "Account",
              }),
            },
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
        ...(currentUser.department === "Accounts" && {
          toBeApprovedCount,
          overdueCount,
          creditCount,
          instantCount,
          tab,
        }),
      },
      data,
    });
  } catch (error) {
    console.error("paymentApproval error:", error);
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
          pay_id: 1,
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
