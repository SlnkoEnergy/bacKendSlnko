const BDnotes = require("../../Modells/bdleads/notes");
const bdleadsModells = require("../../Modells/bdleads/bdleads.model");

const createNotes = async (req, res) => {
  try {
    const { lead_id, user_id, description } = req.body;

    if (!lead_id) {
      return res.status(400).json({ message: "Lead ID is required" });
    }

    const leadExists = await bdleadsModells.findById(lead_id);
    if (!leadExists) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const newNotes = new BDnotes({
      lead_id,
      user_id,
      description,
    });

    await newNotes.save();

    res.status(201).json({
      message: "Notes created successfully",
      note: newNotes,
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
};


const getNotesById = async (req, res) => {
  try {
    const response = await BDnotes.findById(req.params._id);
    if (!response) {
      res.status(404).json({
        message: "Notes not found for this id",
      });
    }

    res.status(200).json({
      message: "Notes for this id found successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const getNotesByLeadId = async (req, res) => {
  try {
    const { lead_id } = req.query;

    if (!lead_id) {
      return res.status(400).json({ message: "Lead ID is required" });
    }

    const notes = await BDnotes.find({ lead_id }).sort({ createdAt: -1 }).populate("user_id", "name");

    res.status(200).json({ message:"notes fetched successfully",data:notes });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notes", error: error.message });
  }
};


const updateNotes = async (req, res) => {
  try {
    const response = await BDnotes.findByIdAndUpdate(req.params._id, req.body, {
      new: true,
    });
    res.status(201).json({
      message: "Notes Updated Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

const deleteNotes = async (req, res) => {
  try {
    const response = await BDnotes.findByIdAndDelete(req.params._id);
    res.status(200).json({
      message: "Notes Deleted Successfully",
      data: response,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

module.exports = { createNotes, getNotesById, updateNotes, deleteNotes, getNotesByLeadId };
