const { default: mongoose } = require("mongoose");
const DprTask = require("../../Modells/dpr/dprTask");

const createDprTask = async (req, res) => {
  try {
    const { DprTaskData } = req.body;

    if (
      !DprTaskData ||
      !DprTaskData.dpr_id ||
      !DprTaskData.name ||
      !DprTaskData.quantity ||
      !DprTaskData.unit
    ) {
      return res.status(400).json({ message: "Please Fill Required Fields" });
    }
    const newDprTask = new DprTask(DprTaskData);
    newDprTask.createdBy = req.user.userId;
    await newDprTask.save();
    res.status(201).json({
      message: "Dpr Task Created Successfully",
      data: newDprTask,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllDprTasks = async (req, res) => {
  try {
    const tasks = await DprTask.aggregate([
      {
        $lookup: {
          from: "dprs",
          localField: "dpr_id",
          foreignField: "_id",
          as: "dpr",
        },
      },
      { $unwind: "$dpr" },
      {
        $lookup: {
          from: "projectdetails",
          localField: "dpr.project_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: "$project" },
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
      {
        $project: {
          name: 1,
          description: 1,
          quantity: 1,
          unit: 1,
          deadline: 1,
          current_log: 1,
          createdAt: 1,
          updatedAt: 1,
          "createdBy._id": 1,
          "createdBy.name": 1,
          "assigned_to._id": 1,
          "assigned_to.name": 1,
          "project.code": 1,
          "project.name": 1,
          "project.project_kwp": 1,
        },
      },
    ]);

    res.status(200).json({ data: tasks });
  } catch (error) {
    console.error("Error fetching DPR Tasks:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};

const updateStatusDprTask = async (req, res) => {
  try {
    const { _id } = req.params;
    const { status, remarks, quantity } = req.body;
    if (!_id || !status || !remarks || quantity === undefined) {
      return res.status(400).json({ message: "Please Fill Required Fields" });
    }
    const dprTask = await DprTask.findById(_id);
    if (!dprTask) {
      return res.status(404).json({ message: "DPR Task Not Found" });
    }
    dprTask.logs.push({
      status,
      remarks,
      quantity,
      user_id: req.user.userId,
    });
    await dprTask.save();
    res
      .status(200)
      .json({ message: "DPR Task Status Updated Successfully", data: dprTask });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getDprTaskById = async (req, res) => {
  try {
    const { _id } = req.params;
    if (!_id) {
      return res.status(400).json({ message: "Please Provide Task ID" });
    }

    const task = await DprTask.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(_id) } },
      {
        $lookup: {
          from: "dprs",
          localField: "dpr_id",
          foreignField: "_id",
          as: "dpr",
        },
      },
      { $unwind: "$dpr" },
      {
        $lookup: {
          from: "projectdetails",
          localField: "dpr.project_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: "$project" },
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
      {
        $project: {
          name: 1,
          description: 1,
          quantity: 1,
          unit: 1,
          deadline: 1,
          current_log: 1,
          createdAt: 1,
          updatedAt: 1,
          "createdBy._id": 1,
          "createdBy.name": 1,
          "assigned_to._id": 1,
          "assigned_to.name": 1,
          "project.code": 1,
          "project.name": 1,
          "project.project_kwp": 1,
        },
      },
    ]);

    if (!task || task.length === 0) {
      return res.status(404).json({ message: "DPR Task Not Found" });
    }

    res.status(200).json({ message: "DPR Task Found", data: task[0] });
  } catch (error) {
    console.error("Error fetching DPR Task by ID:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};


const updateDprTask = async (req, res) => {
  try {
    const { _id } = req.params;
    const { name, description, quantity, unit, deadline, assigned_to } =
      req.body;
    const dprTask = await DprTask.findByIdAndUpdate(
      _id,
      {
        name,
        description,
        quantity,
        unit,
        deadline,
        assigned_to,
      },
      { new: true }
    );
    if (!dprTask) {
      return res.status(404).json({ message: "DPR Task Not Found" });
    }
    res
      .status(200)
      .json({ message: "DPR Task Updated Successfully", data: dprTask });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const deleteDprTask = async (req, res) => {
  try {
    const { _id } = req.params;
    if (!_id) {
      return res.status(400).json({ message: "Please Provide Task ID" });
    }
    const dprTask = await DprTask.findByIdAndDelete(_id);
    if (!dprTask) {
      return res.status(404).json({ message: "DPR Task Not Found" });
    }
    res
      .status(200)
      .json({ message: "DPR Task Deleted Successfully", data: dprTask });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createDprTask,
  getAllDprTasks,
  updateStatusDprTask,
  getDprTaskById,
  updateDprTask,
  deleteDprTask,
};
