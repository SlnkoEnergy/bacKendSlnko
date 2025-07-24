const projectModells = require("../../Modells/projectModells");
const purchaseOrderModells = require("../../Modells/purchaseOrderModells");
const payrequestModells = require("../../Modells/payRequestModells");

const paymentApproved = async (req, res) => {
   try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";

    // Base match filter
    const matchFilter = {
      approved: "Approved",
      $or: [{ acc_match: { $in: [null, ""] } }],
    };

    // Pipeline starts
    const pipeline = [
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
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
          paymentId: "$pay_id",
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

    // Add search filter after projection
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { paymentId: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const data = await payrequestModells.aggregate(pipeline);

    // Recalculate total count with search applied
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
          paymentId: "$pay_id",
          projectId: "$project.code",
          projectName: "$project.name",
        },
      },
    ];

    if (search) {
      countPipeline.push({
        $match: {
          $or: [
            { paymentId: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    countPipeline.push({ $count: "total" });

    const countAgg = await payrequestModells.aggregate(countPipeline);
    const totalRecords = countAgg[0]?.total || 0;

    res.json({
      page,
      limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      data,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error: " + error.message });
  }
};




//UTR Submission
const utrSubmission = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const matchFilter = {
      approved: "Approved",
      acc_match: "matched",
      $or: [{ utr: { $in: [null, ""] } }],
    };

    const pipeline = [
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
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
          paymentId: "$pay_id",
          projectId: "$project.code",
          projectName: "$project.name",
          RequestedFor: "$paid_for",
          vendor: "$vendor",
          paymentDesc: "$comment",
          requestedAmount: "$amt_for_customer",
          accountStatus: "$acc_match",
          createdAt: 1,
        },
      },
    ];

    // Add search filtering after projection
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { paymentId: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const data = await payrequestModells.aggregate(pipeline);

    // Count total records (with search applied)
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
          paymentId: "$pay_id",
          projectId: "$project.code",
          projectName: "$project.name",
        },
      },
    ];

    if (search) {
      countPipeline.push({
        $match: {
          $or: [
            { paymentId: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    countPipeline.push({ $count: "total" });

    const countAgg = await payrequestModells.aggregate(countPipeline);
    const totalRecords = countAgg[0]?.total || 0;

    res.json({
      page,
      limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      data,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error: " + error.message });
  }
};

module.exports = {
  paymentApproved,
  utrSubmission,
};
