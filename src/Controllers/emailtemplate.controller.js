const emailtemplateModel = require("../models/emailtemplate.model");

const createEmailTemplate = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Template data is required" });
    }
    const newTemplate = new emailtemplateModel({
      ...data,
      createdby: req.user.userId,
    });
    await newTemplate.save();
    res.status(201).json({
      message: "Email Template created successfully",
      template: newTemplate,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = req.body;
    const updatedTemplate = await emailtemplateModel.findByIdAndUpdate(
      id,
      data,
      { new: true }
    );
    if (!updatedTemplate) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    res.status(200).json({
      message: "Email Template updated successfully",
      template: updatedTemplate,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateEmailTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const template = await emailtemplateModel.findById(id);
    if (!template) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    if(!status){
        return res.status(400).json({ message: "Status is required" });
    }
    template.status_history.push({ status, user_id:req.user.userId, remarks });
    await template.save();
    res.status(200).json({
      message: "Email Template status updated successfully",
      template,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const deleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTemplate = await emailtemplateModel.findByIdAndDelete(id);
    if (!deletedTemplate) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    res.status(200).json({
      message: "Email Template deleted successfully",
      
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmailTemplates = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { identifier: { $regex: search, $options: "i" } },
      ];
    }
    const templates = await emailtemplateModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await emailtemplateModel.countDocuments(query);
    res.status(200).json({
      message: "Email Templates fetched successfully",
      data: templates,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getEmailTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await emailtemplateModel.findById(id);
    if (!template) {
      return res.status(404).json({ message: "Email Template not found" });
    }
    res.status(200).json({
      message: "Email Template fetched successfully",
      template,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = {
  createEmailTemplate,
  updateEmailTemplate,
  updateEmailTemplateStatus,
  deleteEmailTemplate,
  getEmailTemplates,
  getEmailTemplateById,
};
