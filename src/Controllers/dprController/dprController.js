const Dpr = require("../../Modells/dpr/dpr");

const createDpr = async (req, res) => {
  try {
    const { dprData } = req.body;

    if (!dprData) {
      return res.status(400).json({ message: "DPR data is required" });
    }

    const newDpr = new Dpr({ ...dprData, createdBy: req.user.userId });
    await newDpr.save();

    return res.status(201).json({
      message: "DPR created successfully",
      data: newDpr,
    });
  } catch (error) {
    console.error("Error creating DPR:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllDpr = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const skip = (page - 1) * limit;

    const matchStage = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { "project_id.code": { $regex: search, $options: "i" } },
            { "project_id.name": { $regex: search, $options: "i" } },
            { "project_id.state": { $regex: search, $options: "i" } },
            { "assigned_to.name": { $regex: search, $options: "i" } },
            { "createdBy.name": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const basePipeline = [
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_id",
        },
      },
      { $unwind: "$project_id" },
      {
        $lookup: {
          from: "users",
          localField: "assigned_to",
          foreignField: "_id",
          as: "assigned_to",
        },
      },
      { $unwind: { path: "$assigned_to", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy",
        },
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
    ];

    const projectionStage = {
      $project: {
        title: 1,
        description: 1,
        current_status: 1,
        createdAt: 1,
        updatedAt: 1,
        "project_id.code": 1,
        "project_id.name": 1,
        "project_id.state": 1,
        "project_id.project_kwp": 1,
        "assigned_to._id": 1,
        "assigned_to.name": 1,
        "createdBy.name": 1,
      },
    };

    const dprsPipeline = [
      ...basePipeline,
      projectionStage,
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const countPipeline = [...basePipeline, { $count: "total" }];

    const [dprs, totalCountArr] = await Promise.all([
      Dpr.aggregate(dprsPipeline),
      Dpr.aggregate(countPipeline),
    ]);

    const totalItems = totalCountArr[0]?.total || 0;

    res.status(200).json({
      data: dprs,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
    });
  } catch (error) {
    console.error("Error fetching DPRs:", error);
    res.status(500).json({ error: "Internal Server error", message: error.message });
  }
};



const getDprById = async (req, res) => {
  try {
    const { _id } = req.params;
    if (!_id) {
      return res.status(400).json({ message: "DPR ID is required" });
    }
    const dpr = await Dpr.findById(_id)
      .populate({
        path: "project_id",
        select: "code name project_kwp state site_address.district_name",
      })
      .populate({
        path: "assigned_to",
        select: "name _id",
      })
      .populate({
        path: "createdBy",
        select: "name _id",
      });

    if (!dpr) {
      return res.status(404).json({ message: "DPR not found" });
    }
    return res
      .status(200)
      .json({ message: "DPR retrieved successfully", data: dpr });
  } catch (error) {
    console.error("Error retrieving DPR:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateDprStatus = async (req, res) => {
  try {
    const { _id } = req.params;
    const { status, remarks} = req.body;

    if (!_id || !status || !remarks) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const dpr = await Dpr.findById(_id);
    if (!dpr) {
      return res.status(404).json({ message: "DPR not found" });
    }
    dpr.status_history.push({
      status,
      remarks,
      user_id: req.user.userId
    });
    await dpr.save();
    res.status(200).json({
      message: "DPR status updated successfully",
      data: dpr,
    });
  } catch (error) {
    console.error("Error updating DPR status:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateDpr = async (req, res) => {
  try {
    const { _id } = req.params;
    const { title, description, project_id, assigned_to } = req.body;
    
    const dpr = await Dpr.findByIdAndUpdate(
      _id,
      {
        title,
        description,
        project_id,
        assigned_to,
      },
      { new: true }
    );
    if (!dpr) {
      return res.status(404).json({ message: "DPR not found" });
    }
    return res
      .status(200)
      .json({ message: "DPR updated successfully", data: dpr });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const deleteDpr = async (req, res) => {
  try {
    const { _id } = req.params;
    if (!_id) {
      return res.status(400).json({ message: "DPR ID is required" });
    }
    const dpr = await Dpr.findByIdAndDelete(_id);
    if (!dpr) {
      return res.status(404).json({ message: "DPR not found" });
    }
    return res.status(200).json({ message: "DPR deleted successfully", data: dpr });
  } catch (error) {
    console.error("Error deleting DPR:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
module.exports = {
  createDpr,
  getAllDpr,
  updateDprStatus,
  deleteDpr,
  updateDpr,
  getDprById,
};
