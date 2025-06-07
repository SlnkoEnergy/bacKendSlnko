const { default: axios } = require("axios");
const moduleCategory = require("../../../Modells/EngineeringModells/engineeringModules/moduleCategory");
const projectDetail = require("../../../Modells/projectModells");
const FormData = require("form-data");
const moduleTemplates = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");
const mongoose = require("mongoose");

const createModuleCategory = async (req, res) => {
  try {
    const response = await moduleCategory.create(req.body);
    res.status(201).json({
      message: "Module Category Created Successfully",
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getModuleCategory = async (req, res) => {
  try {
    const data = await moduleCategory
      .find()
      .populate("items.template_id")
      .populate("project_id");

    res.status(200).json({
      message: "Module Projects fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getModuleCategoryById = async (req, res) => {
  try {
    const data = await moduleCategory
      .findById(req.params._id)
      .populate("items.template_id")
      .populate("project_id");

    res.status(200).json({
      message: "Module Project fetched Successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateModuleCategory = async (req, res) => {
  try {
    const data = await moduleCategory.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true }
    );

    res.status(200).json({
      message: "Module Category Updated Successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateModuleCategoryStatus = async (req, res) => {
  try {
    const { moduleId, itemId } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }
    const moduleCategoryData = await moduleCategory.findById(moduleId);

    if (!moduleCategoryData) {
      return res.status(404).json({
        message: "Module Category not found",
      });
    }

    const item = moduleCategoryData.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    item.status_history.push({
      status,
      remarks,
      user_id: req.user._id,
      updatedAt: new Date(),
    });

    await moduleCategoryData.save();
    res.status(200).json({
      message: "Module Category Status Updated Successfully",
      data: moduleCategoryData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateAttachmentUrl = async (req, res) => {
  try {
    const { categoryId, itemId } = req.params;
    const { attachmentUrls } = req.body;

    if (!attachmentUrls || !Array.isArray(attachmentUrls)) {
      return res.status(400).json({
        message: "Attachment URLs are required and should be an array",
      });
    }

    const moduleCategoryData = await moduleCategory.findById(categoryId);
    if (!moduleCategoryData) {
      return res.status(404).json({
        message: "Module Category not found",
      });
    }
    const item = moduleCategoryData.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    item.attachment_urls.push({
      attachment_number: item.attachment_urls.length + 1,
      attachment_url: attachmentUrls,
    });

    await moduleCategoryData.save();
    res.status(200).json({
      message: "Attachment URLs updated successfully",
      data: moduleCategoryData,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createModuleCategory,
  getModuleCategory,
  getModuleCategoryById,
  updateModuleCategory,
  updateModuleCategoryStatus,
  updateAttachmentUrl,
};
