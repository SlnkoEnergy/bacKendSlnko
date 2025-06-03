const { default: axios } = require("axios");
const moduleCategory = require("../../../Modells/EngineeringModells/engineeringModules/moduleCategory");
const projectDetail = require("../../../Modells/projectModells");
const FormData = require("form-data");
const moduleTemplates = require("../../../Modells/EngineeringModells/engineeringModules/moduleTemplate");
const mongoose = require("mongoose");

const createModuleCategory = async (req, res) => {
  try {
    const data = req.body.data ? JSON.parse(req.body.data) : req.body;
    const project_id = data.project_id;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    const projectCodeData = await projectDetail
      .findById(project_id)
      .select("code");
    const projectCode = projectCodeData?.code?.replace(/\//g, "_");

    if (!projectCode) {
      return res.status(404).json({ message: "Project Code not found" });
    }

    const moduleObjectId = new mongoose.Types.ObjectId();
    const templateConfigs = {};
    let fileIndex = 0;

    const itemsWithAttachments = [];

    for (let idx = 0; idx < (data.items || []).length; idx++) {
      const item = data.items[idx];
      if (!item) continue;

      if (!templateConfigs[item.template_id]) {
        const templateData = await moduleTemplates
          .findById(item.template_id)
          .select("name file_upload");
        templateConfigs[item.template_id] = templateData || {};
      }

      const templateData = templateConfigs[item.template_id];
      const moduleTemplateNameRaw = templateData?.name || `template-${idx + 1}`;
      const moduleTemplateName = moduleTemplateNameRaw.replace(/\s+/g, "_");
      const maxFiles = templateData?.file_upload?.max_files || 0;

      let revisionNumber = "R0";
      revisionNumber = `R${item.attachment_urls?.length || 0}`;
      console.log(item.attachement_urls?.length, "item.attachment_urls");
      const folderName = `engineering/${projectCode}/${moduleTemplateName}/${revisionNumber}`;
      const attachmentUrlsArray = [];

      const urlsForAttachment = [];

      for (
        let i = 0;
        i < maxFiles && fileIndex < (req.files?.length || 0);
        i++, fileIndex++
      ) {
        const file = req.files[fileIndex];

        const form = new FormData();
        form.append("file", file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });

        const uploadUrl = `https://upload.slnkoprotrac.com?containerName=protrac&foldername=${folderName}`;
        try {
          const response = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          const respData = response.data;
          const url =
            Array.isArray(respData) && respData.length > 0
            
              ? respData[0]
              : respData.url ||
                respData.fileUrl ||
                (respData.data && respData.data.url) ||
                null;

          if (url) {
            urlsForAttachment.push(url);
          } else {
            console.warn(`No upload URL found for file ${file.originalname}`);
          }
        } catch (uploadErr) {
          console.error(
            "Upload failed for",
            file.originalname,
            uploadErr.message
          );
        }
      }

      if (urlsForAttachment.length > 0) {
        attachmentUrlsArray.push({
          attachment_number: revisionNumber,
          attachment_url: urlsForAttachment,
        });
      }

      itemsWithAttachments.push({
        ...item,
        attachment_urls:
          attachmentUrlsArray.length > 0
            ? attachmentUrlsArray
            : item.attachment_urls || [],
      });
    }

    const moduleData = new moduleCategory({
      _id: moduleObjectId,
      project_id,
      ...data,
      items: itemsWithAttachments,
    });

    await moduleData.save();

    res.status(201).json({
      message: "Module Category Created Successfully",
      data: moduleData,
    });
  } catch (error) {
    console.error("CreateModuleCategory error:", error);
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
    const data = req.body.data ? JSON.parse(req.body.data) : req.body;
    const { project_id, items } = data;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "Items array with template_id required" });
    }

    // Find the template_id inside items (take the first one with template_id)
    const templateItem = items.find((item) => item.template_id);
    if (!templateItem) {
      return res.status(400).json({ message: "No template_id found in items" });
    }

    const template_id = templateItem.template_id;

    const moduleData = await moduleCategory.findOne({ project_id });
    if (!moduleData) {
      return res
        .status(404)
        .json({ message: "Module Category not found for this project" });
    }

    const projectCodeData = await projectDetail
      .findById(project_id)
      .select("code");
    const projectCode = projectCodeData?.code;
    if (!projectCode) {
      return res.status(404).json({ message: "Project Code not found" });
    }

    let templateData = await moduleTemplates
      .findById(template_id)
      .select("name file_upload");
    if (!templateData) {
      templateData = new moduleTemplates({
        _id: template_id,
        name: `Template_${new Date().getTime()}`,
        file_upload: { max_files: 0 },
      });
      await templateData.save();
    }

    const moduleTemplateNameRaw = templateData.name || "template";
    const moduleTemplateName = moduleTemplateNameRaw.replace(/\s+/g, "_");
    const maxFiles = templateData.file_upload?.max_files || 0;

    // Find existing item index for this template_id
    const itemIndex = moduleData.items.findIndex(
      (item) =>
        item.template_id &&
        template_id &&
        item.template_id.toString() === template_id.toString()
    );

    // Calculate revision number
    let revisionNumber = "R0";
    if (itemIndex !== -1) {
      const existingItem = moduleData.items[itemIndex];
      if (!Array.isArray(existingItem.attachment_urls)) {
        existingItem.attachment_urls = [];
      }
      revisionNumber = `R${existingItem.attachment_urls.length}`;
    }

    const folderName = `engineering/${projectCode}/${moduleTemplateName}/${revisionNumber}`;

    const totalFiles = req.files?.length || 0;
    const filesToUpload = Math.min(maxFiles, totalFiles);

    const urlsForAttachment = [];

    for (let i = 0; i < filesToUpload; i++) {
      const file = req.files[i];

      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const uploadUrl = `https://upload.slnkoprotrac.com?containerName=protrac&foldername=${folderName}`;

      try {
        const response = await axios.post(uploadUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const respData = response.data;
        const url =
          Array.isArray(respData) && respData.length > 0
            ? respData[0]
            : respData.url ||
              respData.fileUrl ||
              (respData.data && respData.data.url) ||
              null;

        if (url) {
          urlsForAttachment.push(url);
        } else {
          console.warn(`No upload URL found for file ${file.originalname}`);
        }
      } catch (uploadErr) {
        console.error(
          "Upload failed for",
          file.originalname,
          uploadErr.message
        );
      }
    }

    if (urlsForAttachment.length === 0) {
      return res
        .status(400)
        .json({ message: "No files uploaded or uploaded files have no URLs" });
    }

    if (itemIndex !== -1) {
      // Append to existing item
      const existingItem = moduleData.items[itemIndex];
      if (!Array.isArray(existingItem.attachment_urls)) {
        existingItem.attachment_urls = [];
      }

      existingItem.attachment_urls.push({
        attachment_number: revisionNumber,
        attachment_url: urlsForAttachment,
      });

      moduleData.items[itemIndex] = existingItem;
    } else {
      // Create new item
      const newItem = {
        template_id: new mongoose.Types.ObjectId(template_id),
        attachment_urls: [
          {
            attachment_number: revisionNumber,
            attachment_url: urlsForAttachment,
          },
        ],
      };

      moduleData.items.push(newItem);
    }

    await moduleData.save();

    res.status(200).json({
      message: "Module Category Updated Successfully",
      data: moduleData,
    });
  } catch (error) {
    console.error("UpdateModuleCategory error:", error);
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
