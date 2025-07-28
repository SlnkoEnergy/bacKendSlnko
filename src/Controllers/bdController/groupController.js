const { default: mongoose } = require("mongoose");
const group = require("../../Modells/bdleads/group");
const userModells = require("../../Modells/userModells");
const {Parser } = require("json2csv")

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
    const user_id = req.user.userId;

    const user = await userModells.findById(user_id);
    const name = user?.name;

    // Common search match
    const searchMatch = {
      $or: [
        { group_name: { $regex: search, $options: "i" } },
        { group_code: { $regex: search, $options: "i" } },
        { "contact_details.mobile": { $regex: search, $options: "i" } },
        { "address.state": { $regex: search, $options: "i" } },
      ],
    };

    // Role-based access condition
    const isAdmin = name === "admin" || name === "IT Team" || name === "Deepak Manodi";

    const accessMatch = isAdmin
      ? {} 
      : { createdBy: user._id }; 

    const matchStage = {
      $and: [search ? searchMatch : {}, accessMatch],
    };

    const groups = await group.aggregate([
      { $match: matchStage },

      {
        $lookup: {
          from: "bdleads",
          localField: "_id",
          foreignField: "group_id",
          as: "leads",
        },
      },
      {
        $addFields: {
          total_lead_capacity: {
            $sum: {
              $map: {
                input: "$leads",
                as: "lead",
                in: { $toDouble: "$$lead.project_details.capacity" },
              },
            },
          },
        },
      },
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
        $addFields: {
          left_capacity: {
            $subtract: [
              { $toDouble: "$project_details.capacity" },
              "$total_lead_capacity",
            ],
          },
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
          total_lead_capacity: 1,
          left_capacity: 1,
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

    const totalCount = await group.countDocuments(matchStage);

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

const getAllGroupDropdown = async (req, res) => {
  try {
    const groups = await group.aggregate([
      // Lookup leads to sum their capacity per group
      {
        $lookup: {
          from: "bdleads",
          localField: "_id",
          foreignField: "group_id",
          as: "leads",
        },
      },
      {
        $addFields: {
          total_lead_capacity: {
            $sum: {
              $map: {
                input: "$leads",
                as: "lead",
                in: {
                  $toDouble: "$$lead.project_details.capacity",
                },
              },
            },
          },
        },
      },

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
        $addFields: {
          left_capacity: {
            $subtract: [
              { $toDouble: "$project_details.capacity" },
              "$total_lead_capacity",
            ],
          },
        },
      },

      {
        $project: {
          group_code: 1,
          group_name: 1,
          project_details: 1,
          source: 1,
          contact_details: 1,
          company_name:1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          total_lead_capacity: 1,
          left_capacity: 1,
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
    ]);

    res.status(200).json({ data: groups });
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

      // Lookup leads with this group_id
      {
        $lookup: {
          from: "bdleads",
          localField: "_id",
          foreignField: "group_id",
          as: "relatedLeads",
        },
      },

      // Add total capacity from related leads
      {
        $addFields: {
          total_lead_capacity: {
            $sum: {
              $map: {
                input: "$relatedLeads",
                as: "lead",
                in: {
                  $toDouble: "$$lead.project_details.capacity"
                },
              },
            },
          },
        },
      },

      {
        $project: {
          group_code: 1,
          group_name: 1,
          company_name: 1,
          project_details: 1,
          source: 1,
          contact_details: 1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          total_lead_capacity: 1,
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

const getexportToCSVGroup = async (req, res) => {
  try {
    const { Ids } = req.body;

    const objectIds = Ids.map((id) => new mongoose.Types.ObjectId(id));

    const groupData = await group.aggregate([
      {
        $match: {
          _id: { $in: objectIds },
        },
      },
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
        $lookup: {
          from: "bdleads",
          localField: "_id",
          foreignField: "group_id",
          as: "leads",
        },
      },
      {
        $addFields: {
          total_lead_capacity: {
            $sum: {
              $map: {
                input: "$leads",
                as: "lead",
                in: {
                  $toDouble: "$$lead.project_details.capacity",
                },
              },
            },
          },
          createdByName: "$createdByUser.name",
          statusUserName: "$statusUser.name",
        },
      },
      {
        $project: {
          group_code: 1,
          group_name: 1,
          "project_details.scheme": 1,
          capacity: "$project_details.capacity",
          company_name: 1,
          "address.state": 1,
          "contact_details.email": 1,
          total_lead_capacity: 1,
          createdAt: 1,
          createdByName: 1,
          statusUserName: 1,
          "current_status.status": 1,
        },
      },
    ]);

    // Flatten records for CSV
    const flattenedData = groupData.map((item) => ({
      "Group Code": item.group_code,
      "Group Name": item.group_name,
      "Total Capacity": item.capacity,
      "State": item.address?.state || "",
      "Scheme": item.project_details?.scheme || "",
      "Created At": new Date(item.createdAt).toLocaleString("en-IN"),
      "Created By": item.createdByName || "",
      "Status": item.current_status?.status || "",
    }));

    const fields = [
      "Group Code",
      "Group Name",
      "Total Capacity",
      "State",
      "Scheme",
      "Created At",
      "Created By",
      "Status",
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(flattenedData);

    res.header("Content-Type", "text/csv");
    res.attachment("groups.csv");
    return res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err);
    res
      .status(500)
      .json({ message: "CSV export failed", error: err.message });
  }
};

module.exports = {
  createGroup,
  getAllGroup,
  getGroupById,
  updateGroup,
  updateGroupStatus,
  deleteGroup,
  getAllGroupDropdown,
  getexportToCSVGroup
};

