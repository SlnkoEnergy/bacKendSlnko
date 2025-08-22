const payrequestModells = require("../../Modells/payRequestModells");

const paymentApproved = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const search = req.query.search?.trim() || "";

    const matchFilter = {
      approved: "Approved",
      $or: [{ acc_match: null }, { acc_match: "" }],
    };

    const pipeline = [
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
      },
      { $unwind: "$project" },
      {
        $project: {
          _id: 0,
          pay_id: "$pay_id",
          cr_id: "$cr_id",
          projectId: "$project.code",
          projectName: "$project.name",
          requestedFor: "$paid_for",
          vendor: "$vendor",
          paymentDesc: "$comment",
          requestedAmount: "$amt_for_customer",
          createdAt: 1,
        },
      },
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { pay_id: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { requestedFor: { $regex: search, $options: "i" } },
            { vendor: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const data = await payrequestModells.aggregate(pipeline);

    const countPipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
      },
      { $unwind: "$project" },
      {
        $project: {
          pay_id: "$pay_id",
          projectId: "$project.code",
          projectName: "$project.name",
          requestedFor: "$paid_for",
          vendor: "$vendor",
        },
      },
    ];

    if (search) {
      countPipeline.push({
        $match: {
          $or: [
            { pay_id: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { requestedFor: { $regex: search, $options: "i" } },
            { vendor: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    countPipeline.push({ $count: "total" });

    const countAgg = await payrequestModells.aggregate(countPipeline);
    const total = countAgg[0]?.total || 0;

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
    res.status(500).json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
};


const utrSubmission = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const search = req.query.search?.trim() || "";

    const commonMatch = { approved: "Approved", acc_match: "matched" };
    const len = (fieldRef) => ({
      $strLenCP: {
        $trim: {
          input: {
            $toString: { $ifNull: [fieldRef, ""] },
          },
        },
      },
    });

    const basePipeline = [
      { $match: commonMatch },
      {
        $lookup: {
          from: "projectdetails",
          localField: "p_id",
          foreignField: "p_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          latestUTRStatus: { $arrayElemAt: ["$utr_history.status", -1] },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
             
              {
                $and: [
                  { $gt: [len("$pay_id"), 0] },
                  { $eq: [len("$utr"), 0] },
                  { $eq: [len("$cr_id"), 0] },
                ],
              },
              {
                $and: [
                  { $gt: [len("$cr_id"), 0] },
                  { $gt: [len("$utr"), 0] },
                  { $eq: [len("$pay_id"), 0] },
                  { $ne: ["$latestUTRStatus", "Updated"] },
                  { $eq: ["$approval_status.stage", "Final"] },
                ],
              },
            ],
          },
        },
      },
    ];
    const dataPipeline = [
      ...basePipeline,
      {
        $project: {
          _id: 0,
          pay_id: 1,
          cr_id: 1,
          utr: 1,
          createdAt: 1,
          projectId: "$project.code",
          projectName: "$project.name",
          requestedFor: "$paid_for",
          vendor: "$vendor",
          paymentDesc: "$comment",
          requestedAmount: "$amt_for_customer",
          accountStatus: "$acc_match",
        },
      },
    ];

    if (search) {
      const rx = new RegExp(search, "i");
      dataPipeline.push({
        $match: {
          $or: [
            { pay_id: rx },
            { cr_id: rx },
            { projectId: rx },
            { projectName: rx },
            { requestedFor: rx },
            { vendor: rx },
          ],
        },
      });
    }

    dataPipeline.push({ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: pageSize });

    const data = await payrequestModells.aggregate(dataPipeline);

    const countPipeline = [...basePipeline, { $count: "total" }];
    const countAgg = await payrequestModells.aggregate(countPipeline);
    const total = countAgg[0]?.total || 0;

    res.json({
      success: true,
      meta: { total, page, pageSize, count: data.length },
      data,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error: " + error.message });
  }
};





module.exports = {
  paymentApproved,
  utrSubmission,
};
