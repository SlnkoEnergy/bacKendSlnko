const postsModel = require("../models/posts.model");
const projectModel = require("../models/project.model");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");

const createPost = async (req, res) => {
  try {
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data || {};

    const { project_id, comments, created_by } = data;
    if (!project_id || !created_by) {
      return res.status(400).json({ message: "project_id and created_by required" });
    }

    // fetch project code
    const project = await projectModel.findById(project_id).select("code");
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    let uploadedAttachment = null;
    if (req.files && req.files.length > 0) {
      const file = req.files[0];
      const mimeType = mime.lookup(file.originalname) || file.mimetype;
      let buffer = file.buffer;

      if (mimeType.startsWith("image/")) {
        const extension = mime.extension(mimeType);
        if (extension === "jpeg" || extension === "jpg") {
          buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
        } else if (extension === "png") {
          buffer = await sharp(buffer).png({ quality: 50 }).toBuffer();
        } else {
          buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
        }
      }

      const folderPath = `Posts/${project.code.replace(/ /g, "_")}`;
      const form = new FormData();
      form.append("file", buffer, {
        filename: file.originalname,
        contentType: mimeType,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;
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
        uploadedAttachment = { name: file.originalname, url };
      }
    }

    // Check if post already exists for the project
    let post = await postsModel.findOne({ project_id });

    if (post) {
      // Append new comment & attachment
      if (comments) post.comments.push(comments);
      if (uploadedAttachment) post.attachment = uploadedAttachment;
      await post.save();
    } else {
      // Create new post document
      post = new postsModel({
        project_id,
        comments: comments ? [comments] : [],
        created_by,
        attachment: uploadedAttachment,
        followers: [{ user_id: created_by }],
      });
      await post.save();
    }

    return res.status(201).json({ message: "Post saved successfully", data: post });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

const getPosts = async (req, res) => {
  try {
    const { project_id } = req.query;

    const filter = {};
    if (project_id) {
      filter.project_id = project_id;
    }

    const posts = await postsModel.find(filter)
      .populate("project_id", "code name")
      .populate("created_by", "name emp_id")
      .populate("followers.user_id", "name emp_id")
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: posts });
  } catch (err) {
    console.error("getPosts error:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

const updatePost = async (req, res) => {
  try {
    const { project_id } = req.query;
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data || {};

    const { comments } = data;

    if (!project_id) {
      return res.status(400).json({ message: "project_id is required in query" });
    }

    const post = await postsModel.findOne({ project_id });
    if (!post) return res.status(404).json({ message: "Post not found for project" });

    // Push new comment if present
    if (comments) {
      post.comments.push(comments);
    }

    // Handle attachments upload
    if (req.files && req.files.length > 0) {
      const project = await projectModel.findById(project_id).select("code");
      const folderPath = `Posts/${project.code.replace(/ /g, "_")}`;

      for (const file of req.files) {
        const mimeType = mime.lookup(file.originalname) || file.mimetype;
        let buffer = file.buffer;

        if (mimeType.startsWith("image/")) {
          const extension = mime.extension(mimeType);
          if (extension === "jpeg" || extension === "jpg") {
            buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
          } else if (extension === "png") {
            buffer = await sharp(buffer).png({ quality: 50 }).toBuffer();
          } else {
            buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
          }
        }

        const form = new FormData();
        form.append("file", buffer, {
          filename: file.originalname,
          contentType: mimeType,
        });

        const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;
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
          if (!post.attachments) post.attachments = [];
          post.attachments.push({ name: file.originalname, url });
        }
      }
    }

    await post.save();

    const updated = await postsModel.findOne({ project_id })
      .populate("project_id")
      .populate("created_by")
      .populate("followers.user_id");

    return res.status(200).json({ message: "Post updated", data: updated });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await postsModel.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Post not found" });

    return res.status(200).json({ message: "Post deleted" });
  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};

const addFollowers = async (req, res) => {
  try {
    const { project_id } = req.query;
    const { followers } = req.body;

    if (!project_id) {
      return res.status(400).json({ message: "project_id required in query" });
    }
    if (!Array.isArray(followers) || followers.length === 0) {
      return res.status(400).json({ message: "followers must be a non-empty array" });
    }

    const post = await postsModel.findOne({ project_id });
    if (!post) return res.status(404).json({ message: "Post not found for project" });

    const existingFollowers = post.followers.map(f => f.user_id.toString());
    const newFollowers = followers.filter(uid => !existingFollowers.includes(uid));

    if (newFollowers.length > 0) {
      post.followers.push(...newFollowers.map(uid => ({ user_id: uid })));
      await post.save();
    }

    return res.status(200).json({ message: "Followers added", data: post });
  } catch (err) {
    console.error("addFollowers error:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};


module.exports = {
  createPost,
  getPosts,
  updatePost,
  deletePost,
  addFollowers
};
