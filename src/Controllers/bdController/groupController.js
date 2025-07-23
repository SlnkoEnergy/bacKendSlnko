const { default: mongoose } = require("mongoose");
const group = require("../../Modells/bdleads/group");

const createGroup = async (req, res) => {
  try {
    const { data } = req.body;
    const user_id = req.user.userId;
    const requiredFields = [
      "group_name",
      "contact_details.mobile",
      "address.village",
      "address.district",
      "address.state",
      "project_details.capacity",
      "source.from",
      
    ];

    const isMissing = requiredFields.some((path) => {
      const keys = path.split(".");
      let current = data;
      for (const key of keys) {
        current = current?.[key];
        if (!current) return true;
      }
      return false;
    });

    if (isMissing) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields." });
    }

    const lastGroup = await group.aggregate([
      { $match: { group_code: { $regex: /^BD\/Group\// } } },
      {
        $addFields: {
          numericId: {
            $toInt: { $arrayElemAt: [{ $split: ["$group_code", "/"] }, -1] },
          },
        },
      },
      { $sort: { numericId: -1 } },
      { $limit: 1 },
    ]);

    const lastNumber = lastGroup?.[0]?.numericId || 0;
    const nextId = `BD/Group/${lastNumber + 1}`;

    const payload = {
      ...data,
      group_code: nextId,
      createdBy: user_id,
    };

    const groupData = new group(payload);
    await groupData.save();
    res.status(200).json({
      message: "Group created successfully",
      data: groupData,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Something went wrong" });
  }
};

const getAllGroup = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const matchStage = {
      $or: [
        { group_name: { $regex: search, $options: "i" } },
        { group_code: { $regex: search, $options: "i" } },
        { "contact_details.mobile": { $regex: search, $options: "i" } },
         { "address.state": { $regex: search, $options: "i" } },
      ],
    };

    const groups = await group.aggregate([
      { $match: search ? matchStage : {} },

      // Join createdBy user
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdByUser",
        },
      },
      {
        $unwind: {
          path: "$createdByUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Join current_status.user_id
      {
        $lookup: {
          from: "users",
          localField: "current_status.user_id",
          foreignField: "_id",
          as: "statusUser",
        },
      },
      {
        $unwind: {
          path: "$statusUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          group_code: 1,
          group_name: 1,
          project_details: 1,
          source: 1,
          contact_details: 1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          current_status: {
            status: 1,
            remarks: 1,
            user_id: "$current_status.user_id",
            user_name: "$statusUser.name",
          },
          createdBy: {
            _id: "$createdByUser._id",
            name: "$createdByUser.name",
          },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const totalCount = await group.countDocuments(
      search ? (matchStage.$or.length > 0 ? matchStage : {}) : {}
    );

    res.status(200).json({
      data: groups,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};

const getGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    const groupData = await group.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },

      // Populate createdBy user
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdByUser",
        },
      },
      {
        $unwind: {
          path: "$createdByUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Populate current_status.user_id
      {
        $lookup: {
          from: "users",
          localField: "current_status.user_id",
          foreignField: "_id",
          as: "statusUser",
        },
      },
      {
        $unwind: {
          path: "$statusUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          group_code: 1,
          group_name: 1,
          project_details: 1,
          source: 1,
          contact_details: 1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          current_status: {
            status: 1,
            remarks: 1,
            user_id: "$current_status.user_id",
            user_name: "$statusUser.name",
          },
          createdBy: {
            _id: "$createdByUser._id",
            name: "$createdByUser.name",
          },
          status_history: 1,
        },
      },
    ]);

    if (!groupData.length) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.status(200).json({ data: groupData[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};

const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = req.body;

    if (!id || !data) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const groupData = await group.findById(id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    Object.assign(groupData, data);

    await groupData.save();

    await groupData.populate([
      { path: "createdBy", select: "_id name" },
      { path: "current_status.user_id", select: "_id name" },
    ]);

    res
      .status(200)
      .json({ message: "Group updated successfully", data: groupData });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};

const updateGroupStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const user_id = req.user?.userId;

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }
    console.log(status);
    const groupData = await group.findById(id);
    if (!groupData) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    groupData.status_history.push({ status, remarks, user_id });

    await groupData.save();

    res.status(200).json({
      message: "Status updated successfully",
      data: groupData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    const deleted = await group.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};

const groupDropdown = async (req, res) => {
  try {
    const groups = await group.find({}, { _id: 1, group_name: 1, group_code:1 });
    return res.status(200).json({
      message: "Group list fetched successfully",
      data: groups,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createGroup,
  getAllGroup,
  getGroupById,
  updateGroup,
  updateGroupStatus,
  deleteGroup,
  groupDropdown,
};

