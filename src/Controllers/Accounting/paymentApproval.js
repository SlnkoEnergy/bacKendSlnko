const { default: mongoose } = require("mongoose");
const payRequestModells = require("../../Modells/payRequestModells");
const User = require("../../Modells/users/userModells");
const { default: axios } = require("axios");

const paymentApproval = async function (req, res) {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const currentUser = await User.findById(req.user.userId);

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

    let accessFilter = {
      $match: { approved: "Pending", $expr: { $literal: false } },
    };

    if (currentUser.department === "SCM" && currentUser.role === "manager") {
      accessFilter = {
        $match: {
          approved: "Pending",
          $or: [
            { "approval_status.stage": "Credit Pending" },
            { "approval_status.stage": "Draft" },
          ],
        },
      };
    } else if (
      currentUser.department === "Internal" &&
      currentUser.role === "manager"
    ) {
      accessFilter = {
        $match: {
          approved: "Pending",
          "approval_status.stage": "CAM",
        },
      };
    } else if (
      currentUser.department === "Accounts" &&
      currentUser.role === "manager"
    ) {
      accessFilter = {
        $match: {
          approved: "Pending",
          "approval_status.stage": "Account",
        },
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
      accessFilter,

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

    const validPoIds = poIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
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
          amount_paid: 1,
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
    res.status(500).json({ message: "Error Fetching PDF", error: error.message });
  }
};


module.exports = {
  paymentApproval,
  getPoApprovalPdf,
};
