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
    const { page, limit, search, status, tags } = req.query;

    const norm = (v) => (v === undefined || v === null ? "" : String(v).trim());
    const isPresent = (v) => {
      const s = norm(v).toLowerCase();
      return s !== "" && s !== "null" && s !== "undefined";
    };

    const query = {};

    if (isPresent(search)) {
      const q = norm(search);
      query.$or = [
        { "compiled.to": { $regex: q, $options: "i" } },
        { "compiled.subject": { $regex: q, $options: "i" } },
        { provider_message_id: { $regex: q, $options: "i" } },
      ];
    }

    if (isPresent(status)) {
      query["current_status.status"] = norm(status).toLowerCase();
    }

    if (isPresent(tags)) {
      query["compiled.tags"] = norm(tags);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const total = await emailsModel.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / limitNum), 1);

    const emails = await emailsModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      message: "Emails fetched successfully",
      data: emails,
      pagination: { page: pageNum, totalPages, limit: limitNum, total },
    });
  } catch (error) {
    console.error("getEmails error:", error);
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
    let { status, remarks } = req.body;
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

const getUniqueTags = async (req, res) => {
  try {
    const raw = await emailsModel.distinct("compiled.tags", {
      "compiled.tags.0": { $exists: true },
    });

    const tags = (raw || [])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({ success: true, tags });
  } catch (error) {
    console.error("getUniqueTags error:", error);
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
  getUniqueTags,
};
