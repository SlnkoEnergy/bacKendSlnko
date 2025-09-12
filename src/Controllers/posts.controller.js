const postsModel = require("../models/posts.model");
const projectModel = require("../models/project.model");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");
const sanitizeHtml = require("sanitize-html");
const { default: mongoose } = require("mongoose");
const { getnovuNotification } = require("../utils/nouvnotification.utils");
const userModel = require("../models/user.model");

const createPost = async (req, res) => {
  try {
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data || {};

    const { project_id, comments, created_by } = data;
    if (!project_id || !created_by) {
      return res
        .status(400)
        .json({ message: "project_id and created_by required" });
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

    return res
      .status(201)
      .json({ message: "Post saved successfully", data: post });
  } catch (err) {
    console.error("createPost error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

const getPosts = async (req, res) => {
  try {
    const { project_id } = req.query;

    const filter = {};
    if (project_id) {
      filter.project_id = project_id;
    }

    const posts = await postsModel
      .find(filter)
      .populate("project_id", "code name")
      .populate("comments.user_id", "_id name")
      .populate("followers.user_id", "_id name")
      .populate("attachment.user_id", "_id name")
      .sort({ createdAt: -1 });

    return res.status(200).json({ data: posts });
  } catch (err) {
    console.error("getPosts error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

const SANITIZE_CFG = {
  allowedTags: [
    "div",
    "p",
    "br",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "ul",
    "ol",
    "li",
    "a",
    "blockquote",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    span: ["style"],
    div: ["style"],
    p: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowedStyles: {
    "*": {
      color: [/^.+$/],
      "background-color": [/^.+$/],
      "text-decoration": [/^.+$/],
      "font-weight": [/^.+$/],
      "font-style": [/^.+$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
    }),
  },
  textFilter: (text) => (text.length > 100000 ? text.slice(0, 100000) : text),
};

function linkify(text) {
  return String(text || "").replace(
    /(?<!["'=])(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}">${m}</a>`
  );
}

function sanitizeRich(input) {
  const linkified = linkify(input);
  return sanitizeHtml(linkified, SANITIZE_CFG).trim();
}

const updatePost = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res
        .status(400)
        .json({ message: "project_id is required in query" });
    }

    const sendBy_id = req.user.userId;
    const sendBy_Name = await userModel.findById(sendBy_id).select('name');
    let data = req.body?.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return res
          .status(400)
          .json({ message: "Invalid JSON in 'data' field" });
      }
    } else if (typeof data !== "object" || data === null) {
      data = {};
    }

    const rawComment =
      (typeof data.comment === "string" && data.comment) ||
      (typeof data.comments === "string" && data.comments) ||
      (typeof req.body.comment === "string" && req.body.comment) ||
      "";

    // sanitize incoming rich text
    const safeComment = sanitizeRich(rawComment);
    const post = await postsModel.findOne({ project_id });
    if (!post)
      return res.status(404).json({ message: "Post not found for project" });

    if (safeComment) {
      post.comments.push({
        comment: safeComment, // store sanitized HTML
        user_id: req.user?.userId || undefined,
      });
    }

    // handle attachments (array push)
    if (Array.isArray(req.files) && req.files.length > 0) {
      const project = await projectModel.findById(project_id).select("code");
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      const folderPath = `Posts/${String(project.code || "")
        .replace(/[\/ ]/g, "_")
        .replace(/_+/g, "_")
        .trim()}`;

      for (const file of req.files) {
        let buffer = file.buffer;
        const mimeType =
          mime.lookup(file.originalname) ||
          file.mimetype ||
          "application/octet-stream";

        try {
          if (mimeType.startsWith("image/")) {
            const ext = (mime.extension(mimeType) || "").toLowerCase();
            if (ext === "jpeg" || ext === "jpg")
              buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
            else if (ext === "png")
              buffer = await sharp(buffer).png({ quality: 50 }).toBuffer();
            else buffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
          }
        } catch {
          /* keep original buffer on compression failure */
        }

        const form = new FormData();
        form.append("file", buffer, {
          filename: file.originalname,
          contentType: mimeType,
        });

        const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(folderPath)}`;
        const response = await axios.post(uploadUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const resp = response.data;
        const url =
          (Array.isArray(resp) && resp[0]) ||
          resp?.url ||
          resp?.fileUrl ||
          resp?.data?.url ||
          null;
        if (!url)
          return res
            .status(502)
            .json({ message: "Upload service did not return a file URL" });

        post.attachment.push({
          name: file.originalname,
          url,
          user_id: req.user?.userId || undefined,
          updatedAt: new Date(),
        });
      }
    }

    await post.save();

    const updated = await postsModel
      .findOne({ project_id })
      .populate("project_id", "_id code name")
      .populate("followers.user_id", "_id name")
      .populate("comments.user_id", "_id name");

    const project_details = await projectModel.findById(project_id).select("name code");

    if (post.followers.length > 0) {
      try {
        const workflow = "post";
        let data;

        if (safeComment) {
          data = {
            Module: project_details.code,
            sendBy_Name: sendBy_Name.name,
            message: `${safeComment}`,
            link: `/project_detail?page=1&project_id=${project_id}&tab=4`
          }
        } else {
          data = {
            Module: project_details.code,
            sendBy_Name: sendBy_Name.name,
            message: `File Uploaded`,
            link: `/project_detail?page=1&project_id=${project_id}&tab=4`
          }
        }
        const removeID = String(req.user.userId); // make sure type matches
        const senders = post.followers
          .map(item => String(item.user_id)) // normalize ObjectId → string
          .filter(id => id !== removeID);

        setImmediate(() => {
          getnovuNotification(workflow, senders, data).catch(err =>
            console.error("Notification error:", err)
          );
        });
      } catch (error) {
        console.log(error);
      }
    }

    return res.status(200).json({ message: "Post updated", data: updated });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err?.message || String(err),
    });
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
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
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
      return res
        .status(400)
        .json({ message: "followers must be a non-empty array" });
    }

    const post = await postsModel.findOne({ project_id });
    if (!post)
      return res.status(404).json({ message: "Post not found for project" });

    const existingFollowers = post.followers.map((f) => f.user_id.toString());
    const newFollowers = followers.filter(
      (uid) => !existingFollowers.includes(uid)
    );

    if (newFollowers.length > 0) {
      post.followers.push(...newFollowers.map((uid) => ({ user_id: uid })));
      await post.save();
    }

    return res.status(200).json({ message: "Followers added", data: post });
  } catch (err) {
    console.error("addFollowers error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

const removeFollowers = async (req, res) => {
  try {
    const { project_id } = req.query;
    const { followers } = req.body;

    if (!project_id) {
      return res.status(400).json({ message: "project_id is required" });
    }
    if (!Array.isArray(followers) || followers.length === 0) {
      return res.status(400).json({ message: "followers array is required" });
    }

    const projFilter = { project_id };

    const subDocIds = [];
    const userIdsObj = [];
    const userIdsStr = [];

    for (const f of followers) {
      if (!f) continue;
      if (typeof f === "string") {
        if (mongoose.isValidObjectId(f)) {
          userIdsObj.push(new mongoose.Types.ObjectId(f));
        } else {
          userIdsStr.push(String(f));
        }
        continue;
      }

      if (f._id) {
        if (mongoose.isValidObjectId(f._id)) {
          subDocIds.push(new mongoose.Types.ObjectId(String(f._id)));
        } else {
          subDocIds.push(String(f._id));
        }
      }
      if (f.user_id) {
        if (mongoose.isValidObjectId(f.user_id)) {
          userIdsObj.push(new mongoose.Types.ObjectId(String(f.user_id)));
        } else {
          userIdsStr.push(String(f.user_id));
        }
      }
    }

    const pullConds = [];
    if (subDocIds.length) {
      const objIds = subDocIds.filter(
        (v) => v instanceof mongoose.Types.ObjectId
      );
      const strIds = subDocIds.filter((v) => typeof v === "string");
      if (objIds.length) pullConds.push({ _id: { $in: objIds } });
      if (strIds.length) pullConds.push({ _id: { $in: strIds } });
    }
    if (userIdsObj.length) pullConds.push({ user_id: { $in: userIdsObj } });
    if (userIdsStr.length) pullConds.push({ user_id: { $in: userIdsStr } });

    if (!pullConds.length) {
      return res
        .status(400)
        .json({ message: "No valid follower identifiers provided" });
    }

    const pullExpr = pullConds.length === 1 ? pullConds[0] : { $or: pullConds };

    const updated = await postsModel
      .findOneAndUpdate(
        projFilter,
        { $pull: { followers: pullExpr } },
        { new: true }
      )
      .populate("followers.user_id", "_id name")
      .populate("project_id", "_id code name");

    if (!updated) {
      return res.status(404).json({ message: "Post not found for project" });
    }

    return res.status(200).json({
      message: "Followers removed successfully",
      data: updated,
    });
  } catch (error) {
    console.error("removeFollowers error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error?.message || String(error),
    });
  }
};

module.exports = {
  createPost,
  getPosts,
  updatePost,
  deletePost,
  addFollowers,
  removeFollowers,

};
