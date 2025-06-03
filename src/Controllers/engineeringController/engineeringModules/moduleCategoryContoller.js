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

    const projectCodeData = await projectDetail.findById(project_id).select("code");
    const projectCode = projectCodeData?.code;

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
        const templateData = await moduleTemplates.findById(item.template_id).select("name file_upload");
        templateConfigs[item.template_id] = templateData || {};
      }

      const templateData = templateConfigs[item.template_id];
      const moduleTemplateNameRaw = templateData?.name || `template-${idx + 1}`;
      const moduleTemplateName = moduleTemplateNameRaw.replace(/\s+/g, "_");
      const maxFiles = templateData?.file_upload?.max_files || 0;
      const revisionNumber = 'R0';
      const folderName = `engineering/${projectCode}/${moduleTemplateName}/${revisionNumber}`;

      const attachmentUrlsArray = [];

      const urlsForAttachment = [];

      for (let i = 0; i < maxFiles && fileIndex < (req.files?.length || 0); i++, fileIndex++) {
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
              : respData.url || respData.fileUrl || (respData.data && respData.data.url) || null;

          if (url) {
            urlsForAttachment.push(url);
          } else {
            console.warn(`No upload URL found for file ${file.originalname}`);
          }
        } catch (uploadErr) {
          console.error("Upload failed for", file.originalname, uploadErr.message);
        }
      }

      if (urlsForAttachment.length > 0) {
        attachmentUrlsArray.push({
          attachment_number: 1,
          attachment_url: urlsForAttachment,
        });
      }

      itemsWithAttachments.push({
        ...item,
        attachment_urls: attachmentUrlsArray.length > 0 ? attachmentUrlsArray : item.attachment_urls || [],
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



// const createModuleCategory = async (req, res) => {
//   try {
//     const response = await moduleCategory.create(req.body);
//     res.status(201).json({
//       message: "Module Category Created Successfully",
//       data: response,
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Internal Server Error",
//       error: error.message,
//     });
//   }
// };

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
