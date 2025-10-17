const DprActivities = require("../models/dpractivities.model");
const Activities = require("../models/activities.model");

const createDPR = async (req, res) => {
  try {
    const data = req.body;

    if (!data.project_id) {
      return res.status(400).json({ message: "project_id are required" });
    }

    const newDpr = new DprActivities(data);
    const savedDpr = await newDpr.save();

    res.status(201).json({
      success: true,
      message: "DPR activity saved successfully",
      data: savedDpr,
    });
  } catch (error) {
    console.error("Error saving DPR activity:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save DPR activity",
      error: error.message,
    });
  }
};

const getAllActivities = async (req, res) => {
  try {
    const activities = await Activities.find(
      {},
      { _id: 1, name: 1, order: 1 }
    ).lean();

    res.status(200).json({
      success: true,
      count: activities.length,
      data: activities,
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activities",
      error: error.message,
    });
  }
};

module.exports = {
  createDPR,
  getAllActivities,
};
