const { default: mongoose } = require("mongoose");
const payRequestModells = require("../../Modells/payRequestModells");
const User = require("../../Modells/users/userModells");
const { default: axios } = require("axios");

const paymentApproval = async function (req, res) {
  try {
    const search = req.query.search?.trim() || "";
    const tab =
      req.query.tab === "finalApprovalPayments"
        ? "finalApprovalPayments"
        : "payments";

    const page = Number.parseInt(req.query.page, 10) || 1;
    const pageSize = Number.parseInt(req.query.pageSize, 10) || 50;

    const raw = (req.query.delaydays ?? "").toString().trim();
    const delaydays = raw === "" ? null : Number(raw);
    const applyDelayFilter = Number.isFinite(delaydays);

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let accessFilter = {};
    if (currentUser.department === "SCM" && currentUser.role === "manager") {
      accessFilter = {
        approved: "Pending",
        $or: [
          { code: { $regex: search, $options: "i" } },
          { pay_id: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
          { p_group: { $regex: search, $options: "i" } },
        ],
      };
    } else if (
<<<<<<< HEAD
      (currentUser.department === "Projects" || currentUser.department === "Infra")  &&
=======
      (currentUser.department === "Projects" ||
        currentUser.department === "Infra") &&
>>>>>>> accounts-approval
      currentUser.role === "visitor"
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
        $or: [
          { "approval_status.stage": "Account" },
          { "approval_status.stage": "Credit Pending" },
          { "approval_status.stage": "Initial Account" },
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

    // ---------- tab filter (Accounts only) ----------
    const CR_EMPTY = {
      $or: [{ cr_id: { $exists: false } }, { cr_id: null }, { cr_id: "" }],
    };
    const CR_PRESENT = { cr_id: { $nin: [null, ""] } };
    const PAY_PRESENT = { pay_id: { $nin: [null, ""] } };

    let tabFilter = {};
    if (currentUser.department === "Accounts") {
      if (tab === "finalApprovalPayments") {
        tabFilter = { "approval_status.stage": "Initial Account" };
      } else {
        tabFilter = {
          "approval_status.stage": "Account",
          $or: [CR_PRESENT, { ...CR_EMPTY, ...PAY_PRESENT }],
        };
      }
    }

    const combinedMatch = { ...accessFilter, ...tabFilter };

    // ---------- search filter (applied after project lookup) ----------
    const searchFilter = search
      ? {
          $or: [
            { code: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { p_group: { $regex: search, $options: "i" } },
            { po_number: { $regex: search, $options: "i" } },
            { pay_id: { $regex: search, $options: "i" } },
            { cr_id: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // ---------- expressions ----------
    const remDaysExpr = {
      $let: {
        vars: {
          parsedDeadline: {
            $cond: [
              { $eq: [{ $type: "$credit.credit_deadline" }, "date"] },
              "$credit.credit_deadline",
              {
                $dateFromString: {
                  dateString: "$credit.credit_deadline",
                  onError: null,
                  onNull: null,
                },
              },
            ],
          },
          nowDayIST: {
            $dateTrunc: {
              date: "$$NOW",
              unit: "day",
              timezone: "Asia/Kolkata",
            },
          },
        },
        in: {
          $cond: [
            { $ne: ["$$parsedDeadline", null] },
            {
              $dateDiff: {
                startDate: "$$nowDayIST",
                endDate: {
                  $dateTrunc: {
                    date: "$$parsedDeadline",
                    unit: "day",
                    timezone: "Asia/Kolkata",
                  },
                },
                unit: "day",
              },
            },
            null,
          ],
        },
      },
    };

    const delaydaysMatchStage = Number.isFinite(delaydays)
      ? delaydays === -1
        ? [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$remainingDays", null] },
                    { $lt: ["$remainingDays", 0] },
                  ],
                },
              },
            },
          ]
        : [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$remainingDays", null] },
                    { $gte: ["$remainingDays", 0] },
                    { $lte: ["$remainingDays", delaydays] },
                  ],
                },
              },
            },
          ]
      : [];

    // ---------- base pipeline ----------
    const basePipeline = [
      { $match: combinedMatch },

      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          code: "$project.code",
          name: "$project.name",
          p_group: "$project.p_group",
        },
      },

      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),

      {
        $lookup: {
          from: "purchaseorders",
          localField: "po_number",
          foreignField: "po_number",
          as: "purchase",
        },
      },
      {
        $addFields: {
          po_value: {
            $ifNull: [{ $arrayElemAt: ["$purchase.po_value", 0] }, 0],
          },
        },
      },

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
          from: "subtract moneys", // ensure this matches your actual collection name
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
                            { $eq: ["$approved", "Approved"] },
                            {
                              $eq: [
                                "$approval_status.stage",
                                "Initial Account",
                              ],
                            },
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

      // credit user
      {
        $lookup: {
          from: "users",
          localField: "credit.user_id",
          foreignField: "_id",
          as: "creditUser",
        },
      },
      { $unwind: { path: "$creditUser", preserveNullAndEmptyArrays: true } },

      // group balances
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
          remainingDays: remDaysExpr,
        },
      },

      ...delaydaysMatchStage,

      // final shape
      {
        $project: {
          _id: 1,
          pay_id: 1,
          cr_id: 1,
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
          po_number: 1,
          vendor: 1,
          credit_extension: "$credit.credit_extension",
          credit_remarks: "$credit.credit_remarks",
          credit_user_name: "$creditUser.name",
          totalCredited: {
            $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0],
          },
          totalPaid: {
            $ifNull: [{ $arrayElemAt: ["$creditBalanceData.totalPaid", 0] }, 0],
          },
          creditBalance: 1,
          // ---- pay_type classification ----
          pay_type: {
            $cond: [
              { $and: [{ $ne: ["$pay_id", null] }, { $ne: ["$pay_id", ""] }] },
              "instant",
              {
                $cond: [
                  {
                    $and: [{ $ne: ["$cr_id", null] }, { $ne: ["$cr_id", ""] }],
                  },
                  "credit",
                  "unknown",
                ],
              },
            ],
          },
        },
      },
    ];

    const sortStage =
      currentUser.department === "Accounts" && tab === "finalApprovalPayments"
        ? { $sort: { remainingDays: 1, _id: -1 } }
        : { $sort: { _id: -1 } };

    const countPipeline = [...basePipeline, sortStage, { $count: "total" }];
    const paginatedPipeline = [
      ...basePipeline,
      sortStage,
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ];

    const [data, countResult] = await Promise.all([
      payRequestModells.aggregate(paginatedPipeline),
      payRequestModells.aggregate(countPipeline),
    ]);

    const total = countResult?.[0]?.total || 0;

    // ---------- Accounts-only: compute tab badge counts with SAME search ----------
    let paymentsCount;
    let finalApprovalPaymentsCount;

    if (currentUser.department === "Accounts") {
      const baseMatch = {
        $or: [
          { "approval_status.stage": "Account" },
          { "approval_status.stage": "Credit Pending" },
          { "approval_status.stage": "Initial Account" },
        ],
      };

      const paymentsMatch = {
        ...baseMatch,
        "approval_status.stage": "Account",
        $or: [CR_PRESENT, { ...CR_EMPTY, ...PAY_PRESENT }],
      };

      const finalMatch = {
        ...baseMatch,
        "approval_status.stage": "Initial Account",
      };

      // helper for count pipeline (reuses search + remainingDays filter if needed)
      const mkCountPipe = (extraMatch, filterRemainingDays = false) => {
        const pipeline = [
          { $match: extraMatch },
          {
            $lookup: {
              from: "projectdetails",
              localField: "p_id",
              foreignField: "p_id",
              as: "project",
            },
          },
          { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              code: "$project.code",
              name: "$project.name",
              p_group: "$project.p_group",
            },
          },
          ...(Object.keys(searchFilter).length
            ? [{ $match: searchFilter }]
            : []),
        ];

        if (filterRemainingDays) {
          pipeline.push({ $addFields: { remainingDays: remDaysExpr } });
          pipeline.push({ $match: { remainingDays: { $lte: 2 } } });
        }

        pipeline.push({ $count: "total" });
        return pipeline;
      };

      const [pCnt, fCnt] = await Promise.all([
        payRequestModells.aggregate(mkCountPipe(paymentsMatch)),
        payRequestModells.aggregate(mkCountPipe(finalMatch, true)),
      ]);

      paymentsCount = pCnt?.[0]?.total || 0;
      finalApprovalPaymentsCount = fCnt?.[0]?.total || 0;
    }

    return res.json({
      success: true,
      meta: {
        total,
        page,
        pageSize,
        delaydays,
        count: data.length,
        tab,
        ...(currentUser.department === "Accounts" && {
          paymentsCount,
          finalApprovalPaymentsCount,
        }),
      },
      data,
    });
  } catch (error) {
    console.error("paymentApproval error:", error);
    return res
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
