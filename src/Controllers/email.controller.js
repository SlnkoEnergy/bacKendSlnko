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
    const { page, limit, search } = req.query;
    const query = {};
    if (search) {
      query["$or"] = [
        { "compiled.to": { $regex: search, $options: "i" } },
        { "compiled.subject": { $regex: search, $options: "i" } },
        { provider_message_id: { $regex: search, $options: "i" } },
      ];
    }
    const emails = await emailsModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.status(200).json({
      message: "Emails fetched successfully",
      emails,
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
      email,
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
};
