const Initial = require("../../Modells/initialBdLeadModells");
const Followup = require("../../Modells/followupbdModells");
const Warm = require("../../Modells/warmbdLeadModells");
const Won = require("../../Modells/wonleadModells");
const Dead = require("../../Modells/deadleadModells");
const BDtask = require("../../Modells/BD-Dashboard/task");

const createTask = async (req, res) => {
  try {
    const { lead_id, user_id, type, status, assigned_to, description } =
      req.body;

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

    const newTask = new BDtask({
      lead_id,
      lead_model: leadModel,
      user_id,
      type,
      status,
      assigned_to,
      description,
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

const getTaskById = async (req, res) => {
  try {
    const response = await BDtask.findById(req.params._id);
    if (!response) {
      res.status(404).json({
        message: "Task not found for this id",
      });
    }

    res.status(200).json({
      message: "Task for this id found successfully",
     data:response
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

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

module.exports = { createTask, getTaskById, updateTask, deleteTask };
