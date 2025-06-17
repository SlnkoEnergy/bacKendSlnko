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
    const { projectId, engineering } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: "projectId is required" });
    }

    const pipeline = [
      ...(engineering
        ? [
            {
              $match: {
                engineering_category: engineering,
              },
            },
          ]
        : []),
      {
        $lookup: {
          from: "modulecategories",
          let: { templateId: "$_id" },
          pipeline: [
            { $match: { project_id: new mongoose.Types.ObjectId(projectId) } },
            { $unwind: "$items" },
            {
              $match: {
                $expr: {
                  $eq: ["$items.template_id", "$$templateId"],
                },
              },
            },
            {
              $project: {
                _id: 0,
                attachment_urls: "$items.attachment_urls",
                current_attachment: "$items.current_attachment",
                current_status: "$items.current_status",
                status_history: "$items.status_history",
              },
            },
          ],
          as: "itemData",
        },
      },
      {
        $addFields: {
          attachment_urls: {
            $ifNull: [{ $arrayElemAt: ["$itemData.attachment_urls", 0] }, []],
          },
          current_attachment: {
            $ifNull: [{ $arrayElemAt: ["$itemData.current_attachment", 0] }, null],
          },
          current_status: {
            $ifNull: [{ $arrayElemAt: ["$itemData.current_status", 0] }, null],
          },
          status_history: {
            $ifNull: [{ $arrayElemAt: ["$itemData.status_history", 0] }, []],
          },
        },
      },
      {
        $project: {
          itemData: 0, 
        },
      },
    ];

    const templates = await mongoose.model("moduleTemplates").aggregate(pipeline);

    res.status(200).json({
      message: "Templates with item data fetched successfully",
      data: templates,
    });
  } catch (error) {
    console.error("getModuleCategoryById error:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateModuleCategory = async (req, res) => {
  try {
    const data = req.body.data ? JSON.parse(req.body.data) : req.body;
    const { items } = data;
    const { projectId, id } = req.query;

    if (!projectId && !id) {
      return res.status(400).json({ message: "Either 'projectId' or 'id' must be provided in query" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items array with template_id required" });
    }

    const moduleData = id
      ? await moduleCategory.findById(id)
      : await moduleCategory.findOne({ project_id: projectId });

    if (!moduleData) {
      return res.status(404).json({ message: "Module Category not found" });
    }

    const projectCodeData = await projectDetail
      .findById(projectId || moduleData.project_id)
      .select("code");

    const projectCode = projectCodeData?.code?.replace(/\//g, "_");
    if (!projectCode) {
      return res.status(404).json({ message: "Project Code not found" });
    }

    const files = Array.isArray(req.files) ? req.files : req.files?.files || [];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files provided" });
    }

    let fileIndex = 0;

    for (let i = 0; i < items.length; i++) {
      const { template_id } = items[i];
      if (!template_id) continue;

      let templateData = await moduleTemplates.findById(template_id).select("name file_upload");
      if (!templateData) {
        return res.status(400).json({message:"No Module with this template Id"});
      }

      const moduleTemplateName = (templateData.name || "template").replace(/\s+/g, "_");
      const maxFiles = templateData.file_upload?.max_files || 0;

      const itemIndex = moduleData.items.findIndex(
        item => item.template_id?.toString() === template_id.toString()
      );
      const existingItem = itemIndex !== -1 ? moduleData.items[itemIndex] : null;
      const revisionIndex = existingItem?.attachment_urls?.length || 0;
      const revisionNumber = `R${revisionIndex}`;
      const folderName = `engineering/${projectCode}/${moduleTemplateName}/${revisionNumber}`;

      const uploadedUrls = [];

      for (let count = 0; count < maxFiles && fileIndex < files.length; count++, fileIndex++) {
        const file = files[fileIndex];

        try {
          const form = new FormData();
          form.append("file", file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });

          const uploadUrl = `https://upload.slnkoprotrac.com?containerName=protrac&foldername=${folderName}`;
          const { data: respData } = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          const url = Array.isArray(respData)
            ? respData[0]
            : respData?.url || respData?.fileUrl || respData?.data?.url || null;

          if (url) uploadedUrls.push(url);
      
        } catch (err) {
          console.error(`Upload failed for ${file.originalname}:`, err.message);
        }
      }

      if (uploadedUrls.length > 0) {
  const statusHistory = items[i]?.status_history || [];

  if (existingItem) {
    if (!Array.isArray(existingItem.attachment_urls)) {
      existingItem.attachment_urls = [];
    }
    existingItem.attachment_urls.push(uploadedUrls);

    if (!Array.isArray(existingItem.status_history)) {
      existingItem.status_history = [];
    }
    existingItem.status_history.push(...statusHistory);

    moduleData.items[itemIndex] = existingItem;
  } else {
    moduleData.items.push({
      template_id: new mongoose.Types.ObjectId(template_id),
      attachment_urls: [uploadedUrls],
      status_history: statusHistory,
    });
  }
}

    }

    if (fileIndex === 0) {
      return res.status(400).json({ message: "No valid uploaded file URLs found" });
    }

    await moduleData.save();

    return res.status(200).json({
      message: "Module Category Updated Successfully",
      data: moduleData,
    });
  } catch (error) {
    console.error("updateModuleCategory error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const updateModuleCategoryStatus = async (req, res) => {
  try {
    const { projectId, module_template } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const moduleCategoryData = await moduleCategory.findOne({ project_id: projectId });

    if (!moduleCategoryData) {
      return res.status(404).json({ message: "Module Category not found" });
    }

    let templateFound = false;

    for (const item of moduleCategoryData.items) {
      if (item.template_id?.toString() === module_template?.toString()) {
        item.status_history.push({
          status,
          remarks,
          user_id: req.user._id,
          updatedAt: new Date(),
        });

        templateFound = true;
        break;
      }
    }

    if (!templateFound) {
      return res.status(404).json({ message: "Template not found" });
    }

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
