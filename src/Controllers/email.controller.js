const emailsModel = require("../models/emails.model");

const createEmail = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Email data is required" });
    }
    const newEmail = new emailsModel({
      ...data,
      createdby: req.user.userId,
    });
    await newEmail.save();
    res.status(201).json({
      message: "Email created successfully",
      email: newEmail,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmails = async (req, res) => {
  try {
    const { page, limit, search, status } = req.query;
    const query = {};
    if (search) {
      query["$or"] = [
        { "compiled.to": { $regex: search, $options: "i" } },
        { "compiled.subject": { $regex: search, $options: "i" } },
        { provider_message_id: { $regex: search, $options: "i" } },
      ];
    }
    if (status) {
      query["current_status.status"] = status;
    }
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const total = await emailsModel.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / limitNum), 1);
    const emails = await emailsModel
      .find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });
    res.status(200).json({
      message: "Emails fetched successfully",
      data: emails,
      pagination: {
        page: pageNum,
        totalPages,
        limit: limitNum,
        total,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmailById = async (req, res) => {
  try {
    const { id } = req.params;
    const email = await emailsModel.findById(id);
    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }
    res.status(200).json({
      message: "Email fetched successfully",
      data: email,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateEmailStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const email = await emailsModel.findById(id);
    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }
    // Update status history
    email.status_history.push({
      status,
      user_id: req.user.userId,
      remarks,
    });
    await email.save();
    res.status(200).json({
      message: "Email status updated successfully",
      data: email,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = {
  createEmail,
  getEmails,
  getEmailById,
  updateEmailStatus,
};
