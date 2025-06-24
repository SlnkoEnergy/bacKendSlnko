const Initial = require("../../Modells/initialBdLeadModells");
const Followup = require("../../Modells/followupbdModells");
const Warm = require("../../Modells/warmbdLeadModells");
const Won = require("../../Modells/wonleadModells");
const Dead = require("../../Modells/deadleadModells");
const BDtask = require("../../Modells/BD-Dashboard/task");

const createTask = async (req, res) => {
  try {
    const {
      title,
      lead_id,
      user_id,
      type,
      status,
      assigned_to,
      deadline,
      contact_info,
      priority,
      description,
    } = req.body;

    let leadModel = null;
    const leadModels = [
      { model: Initial, name: "Initial" },
      { model: Followup, name: "Followup" },
      { model: Warm, name: "Warm" },
      { model: Won, name: "Won" },
      { model: Dead, name: "Dead" },
    ];

    for (const { model, name } of leadModels) {
      const found = await model.findById(lead_id);
      if (found) {
        leadModel = name;
        break;
      }
    }

    if (!leadModel) {
      return res.status(400).json({ error: "Invalid lead_id" });
    }

    const newTask = new BDtask({
      title,
      lead_id,
      lead_model: leadModel,
      user_id,
      type,
      assigned_to,
      deadline,
      contact_info,
      priority,
      description,
      status_history: [
        {
          status: status || "draft",
          user_id,
        },
      ],
    });

    await newTask.save();

    res
      .status(201)
      .json({ message: "Task created successfully", task: newTask });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { _id } = req.params;
    const { status, remarks, user_id } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const task = await BDtask.findById(_id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    task.status_history.push({
      status,
      user_id,
      remarks
    });

    await task.save();

    res.status(200).json({
      message: "Task status updated successfully",
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllTask = async (req, res) => {
  try {
    const userId = req.user.userId;

    const tasks = await BDtask.find({
      $or: [
        { assigned_to: { $in: [userId] } },
        { user_id: userId }
      ]
    })
      .select("title priority _id lead_id lead_model type current_status assigned_to deadline")
      .populate({
        path: "assigned_to",
        select: "_id name"
      });

    const leadModels = {
      Initial,
      Followup,
      Warm,
      Won,
      Dead,
    };

    const populatedTasks = await Promise.all(
      tasks.map(async (taskDoc) => {
        const task = taskDoc.toObject(); 

        const Model = leadModels[task.lead_model];
        if (Model && task.lead_id) {
          const leadDoc = await Model.findById(task.lead_id).select("_id c_name id");
          if (leadDoc) {
            task.lead_id = {
              _id: leadDoc._id,
              c_name: leadDoc.c_name,
              id:leadDoc.id
            };
          }
        }

        return task;
      })
    );

    return res.status(200).json({ success: true, data: populatedTasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getTaskById = async (req, res) => {
  try {
    const taskDoc = await BDtask.findById(req.params._id)
      .populate("user_id", "_id name")
      .populate("assigned_to", "_id name")
      .populate("status_history.user_id", "_id name");

    if (!taskDoc) {
      return res.status(404).json({
        message: "Task not found for this id",
      });
    }

    const task = taskDoc.toObject();

    const leadModels = {
      Initial,
      Followup,
      Warm,
      Won,
      Dead,
    };

    const Model = leadModels[task.lead_model];
    if (Model && task.lead_id) {
      const leadDoc = await Model.findById(task.lead_id).select("_id c_name id");
      if (leadDoc) {
        task.lead_id = {
          _id: leadDoc._id,
          c_name: leadDoc.c_name,
          id: leadDoc.id,
        };
      }
    }

    res.status(200).json({
      message: "Task for this id found successfully",
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
};

const getTaskByLeadId = async(req, res) => {
  try {
    const {leadId} = req.query;
    if(!leadId){
      return res.status(404).json({
        message:"id or LeadId not found"
      })
    }
    let query = {};
    if(leadId){
      query.lead_id= leadId
    }
    const data = await BDtask.find(query);
    res.status(200).json({
      message:"Task detail fetched successfully",
      data:data
    })
  } catch (error) {
    res.status(500).json({
      message:"Internal Server Error",
      error: error.message
    })
  }
}

const updateTask = async (req, res) => {
  try {
    const response = await BDtask.findByIdAndUpdate(req.params._id, req.body, {
      new: true,
    });
    res.status(201).json({
      message: "Task Updated Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const response = await BDtask.findByIdAndDelete(req.params._id);
    res.status(200).json({
      message: "Task Deleted Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

module.exports = {
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  updateStatus,
  getAllTask,
  getTaskByLeadId
};
