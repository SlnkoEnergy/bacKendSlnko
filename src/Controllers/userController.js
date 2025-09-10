const userModells = require("../Modells/users/userModells");
const { default: mongoose } = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const getSystemIdentifier = require("../utils/generateSystemIdentifier");
const getEmailTemplate = require("../utils/emailTemplate");
const session = require("../Modells/users/session");
const getSessionVerfication = require("../utils/sessionVerification");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");

// helpers used below
const compact = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const trimIfStr = (v) => (typeof v === "string" ? v.trim() : v);

// ===============================
// User Registration
// ===============================
const userRegister = async function (req, res) {
  try {
    let {
      name,
      emp_id,
      email,
      phone,
      department,
      role,
      password,
      location,        // NEW
      about,           // NEW
      attachment_url,  // NEW
    } = req.body;

    if (!name || !emp_id || !email || !password) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    // Check for existing user with same emp_id OR email
    const existingUser = await userModells.findOne({
      $or: [{ emp_id }, { email }],
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ msg: "Employee ID or Email already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newuser = new userModells({
      name,
      emp_id,
      email,
      phone,
      department,
      role,
      password: hashedPassword,
      location,        
      about,           
      attachment_url,
    });

    await newuser.save();
    res.status(200).json({ msg: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Server error: " + error.message });
  }
};

// ===============================
// Delete User
// ===============================
const deleteUser = async function (req, res) {
  const userId = req.params._id;

  try {
    const deletedUser = await userModells.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res
      .status(200)
      .json({ message: "User deleted successfully", user: deletedUser });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting user", error: error.message });
  }
};

// ===============================
// Forgot Password -> Send OTP
// ===============================
const forgettpass = async function (req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }
    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpires = Date.now() + 15 * 60 * 1000; // 15 min
    await user.save();

    const transport = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transport.sendMail({
      from: `"SLNKO Energy Pvt. Ltd" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for Password Reset",
      text: `Your OTP for password reset is: ${otp}`,
      html: getEmailTemplate(otp),
    });

    return res.status(200).json({
      message: "OTP sent successfully. Please check your email.",
      email,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred. Please try again." });
  }
};

// ===============================
// Verify OTP
// ===============================
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!otp) {
      return res.status(400).json({ message: "OTP is required." });
    }

    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    return res.status(200).json({ message: "OTP verified successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ===============================
// Verify OTP & Reset Password
// ===============================
const verifyandResetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Email, new password, and confirm password are required.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ message: "New password and confirm password do not match." });
    }

    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    return res
      .status(200)
      .json({ message: "Password has been reset successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ===============================
// Login (+ BD device flow)
// ===============================
const login = async function (req, res) {
  try {
    const { name, emp_id, email, password, latitude, longitude, fullAddress } =
      req.body;

    if (!password) {
      return res.status(400).json({ msg: "Password is required" });
    }

    const identity = name || emp_id || email;
    if (!identity) {
      return res
        .status(400)
        .json({ msg: "Enter any of username, emp_id, or email" });
    }

    const user = await userModells.findOne({
      $or: [{ name: identity }, { emp_id: identity }, { email: identity }],
    });

    if (!user) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    // Extra verification for BD (and explicit allowlist)
    if (
      user.department === "BD" ||
      name === "Shantanu Sameer" ||
      emp_id === "SE-187" ||
      email === "shantanu.sameer12@gmail.com"
    ) {
      const { device_id, ip } = await getSystemIdentifier(req, res);
      const registeredDevice = await session.findOne({
        user_id: user._id,
        "device_info.device_id": device_id,
      });

      if (!registeredDevice) {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpExpires = Date.now() + 5 * 60 * 1000; // 5 min

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        const transport = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: parseInt(process.env.EMAIL_PORT),
          secure: process.env.EMAIL_SECURE === "true",
          service: process.env.EMAIL_SERVICE,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transport.sendMail({
          from: `"SLnko Energy Alert" <${process.env.EMAIL_USER}>`,
          to: `${process.env.EMAIL_ADMIN}`,
          subject: `Unauthorized Device Login Attempt for ${user.name}`,
          html: getSessionVerfication(
            otp,
            user.emp_id,
            user.name,
            device_id,
            ip,
            latitude,
            longitude,
            fullAddress
          ),
        });

        return res.status(403).json({
          message: "Unrecognized device. OTP has been sent for verification.",
          email: user.email,
        });
      }

      await session.create({
        user_id: user._id,
        device_info: {
          device_id,
          ip,
          latitude,
          longitude,
        },
        login_time: new Date(),
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.PASSKEY);
    return res.status(200).json({ token, userId: user._id });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server error", error: error.message });
  }
};

// ===============================
// Finalize BD login (after OTP approval)
// ===============================
const finalizeBdLogin = async (req, res) => {
  try {
    const { email, latitude, longitude, fullAddress } = req.body;
    const { device_id, ip } = await getSystemIdentifier(req, res);

    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await session.create({
      user_id: user._id,
      device_info: {
        device_id,
        ip,
        latitude,
        longitude,
      },
      login_time: new Date(),
    });

    const token = jwt.sign({ userId: user._id }, process.env.PASSKEY);
    return res.status(200).json({ token, userId: user._id });
  } catch (error) {
    console.error("Finalize BD Login Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ===============================
//
// Logout (closes BD user's active session on this device)
// ===============================
const logout = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await userModells.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User Not Found",
      });
    }

    const isBD = user.department === "BD";

    if (isBD) {
      const { device_id } = await getSystemIdentifier(req, res);
      const sessionToUpdate = await session.findOne({
        user_id: userId,
        "device_info.device_id": device_id,
        logout_time: { $exists: false },
      });

      if (!sessionToUpdate) {
        return res.status(404).json({ message: "No active session found." });
      }

      sessionToUpdate.logout_time = new Date();
      await sessionToUpdate.save();
    }

    return res.status(200).json({ message: "Logged out successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    return res
      .status(500)
      .json({ message: "Internal server error.", error: err.message });
  }
};

// ===============================
// Get All Users (sanitized)
// ===============================
const getalluser = async function (req, res) {
  const users = await userModells
    .find()
    .select("-password -otp -otpExpires");
  res.status(200).json({ data: users });
};

// ===============================
// Get Single User (sanitized)
// ===============================
const getSingleUser = async function (req, res) {
  const userId = req.params._id;

  try {
    const user = await userModells
      .findById(userId)
      .select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // includes: name, emp_id, email, phone, department, role, location, about, attachment_url, timestamps
    res.status(200).json({ user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user", error: error.message });
  }
};

// ===============================
// Get All Users By Department (light projection)
// ===============================

const getAllUserByDepartment = async (req, res) => {
  try {
    const projection = "_id name attachment_url"; // <-- added attachment_url
    const { department } = req.query;

    const query = {};
    if (department) query.department = department;

    const data = await userModells.find(query, projection);
    res.status(200).json({
      message: "All user fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


// ===============================
// Edit User (admin-side)
// ===============================
const editUser = async function (req, res) {
  try {
    const userId = req.params._id || req.params.id;
    if (!userId) return res.status(400).json({ message: "id is required" });
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).json({ message: "invalid id" });

    // body supports multipart "data" (stringified) or plain JSON
    const bodyData =
      typeof req.body?.data === "string"
        ? JSON.parse(req.body.data)
        : req.body?.data || req.body || {};

    const {
      name,
      emp_id,
      email,
      phone,
      department,
      role,
      location,
      about,
      attachment_url, 
    } = bodyData;

    const update = compact({
      name: trimIfStr(name),
      emp_id: trimIfStr(emp_id),
      email: trimIfStr(email),
      phone,
      department: trimIfStr(department),
      role: trimIfStr(role),
      location: trimIfStr(location),
      about: trimIfStr(about),
      attachment_url: trimIfStr(attachment_url),
    });

    // ---------- FILE UPLOAD (mirror your Logistic/PO style) ----------
    // Your frontend sends files as: fd.append("files", file)
    // We also tolerate "avatar" or any other field name.
    let fileBuf = null;
    let originalName = null;
    let guessedMime = null;

    if (req.file?.buffer) {
      fileBuf = req.file.buffer;
      originalName = req.file.originalname || "file";
      guessedMime =
        mime.lookup(originalName) || req.file.mimetype || "application/octet-stream";
    } else if (Array.isArray(req.files) && req.files.length) {
      // prefer the one with fieldname "files", else take the first
      const theFile =
        req.files.find((f) => f.fieldname === "files") ||
        req.files.find((f) => f.fieldname === "avatar") ||
        req.files[0];
      if (theFile?.buffer) {
        fileBuf = theFile.buffer;
        originalName = theFile.originalname || "file";
        guessedMime =
          mime.lookup(originalName) || theFile.mimetype || "application/octet-stream";
      }
    }

    if (fileBuf) {
      // compress images like you do elsewhere
      try {
        if (guessedMime && guessedMime.startsWith("image/")) {
          const ext = mime.extension(guessedMime);
          if (ext === "jpeg" || ext === "jpg") {
            fileBuf = await sharp(fileBuf).jpeg({ quality: 40 }).toBuffer();
          } else if (ext === "png") {
            fileBuf = await sharp(fileBuf).png({ quality: 40 }).toBuffer();
          } else if (ext === "webp") {
            fileBuf = await sharp(fileBuf).webp({ quality: 40 }).toBuffer();
          } else {
            fileBuf = await sharp(fileBuf).jpeg({ quality: 40 }).toBuffer();
          }
        }
      } catch (e) {
        console.warn("Avatar compression failed, using original buffer:", e?.message);
      }

      // upload to your blob service (same as PO/Logistics)
      const folderPath = `users/${userId}`;
      const form = new FormData();
      form.append("file", fileBuf, {
        filename: originalName,
        contentType: guessedMime || "application/octet-stream",
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(
        folderPath
      )}`;

      try {
        const up = await axios.post(uploadUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        const d = up.data;
        const uploadedUrl =
          (Array.isArray(d) && d[0]) ||
          d.url ||
          d.fileUrl ||
          (d.data && d.data.url) ||
          null;

        if (uploadedUrl) {
          update.attachment_url = uploadedUrl; // DB has a single string field
        } else {
          console.warn("No URL returned from upload API.");
        }
      } catch (e) {
        console.error("Avatar upload failed:", e?.message);
      }
    }

    // If neither body fields nor a successful upload, bail out
    // right before:
if (Object.keys(update).length === 0) {
  // If client tried to send a file but upload failed, say that explicitly
  if (Array.isArray(req.files) && req.files.length) {
    return res.status(502).json({ message: "Avatar upload failed" });
  }
  return res.status(400).json({ message: "No fields to update." });
}


    const updatedUser = await userModells
      .findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true, runValidators: true, context: "query" }
      )
      .select("-password -otp -otpExpires");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const fields = Object.keys(error.keyPattern || {});
      return res
        .status(409)
        .json({ message: `Duplicate value for: ${fields.join(", ")}` });
    }
    console.error("editUser error:", error);
    return res
      .status(500)
      .json({ message: "Error updating user", error: error.message });
  }
};


// ===============================
// Get distinct departments
// ===============================
const getAllDepartment = async (req, res) => {
  try {
    const departments = await userModells.distinct("department");
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// BACKFILL: add empty defaults for location, about, attachment_url
const backfillProfileFields = async (req, res) => {
  try {
    // Uses MongoDB aggregation-pipeline update (MongoDB >= 4.2)
    // $ifNull keeps existing values; only fills when field is null or missing.
    const result = await userModells.updateMany(
      {},
      [
        {
          $set: {
            location:        { $ifNull: ["$location", ""] },
            about:           { $ifNull: ["$about", ""] },
            attachment_url:  { $ifNull: ["$attachment_url", ""] },
          },
        },
      ]
    );

    // Normalize counts across mongoose versions
    const matched   = result.matchedCount   ?? result.n ?? 0;
    const modified  = result.modifiedCount  ?? result.nModified ?? 0;

    return res.status(200).json({
      message: "Backfill complete",
      matched,
      modified,
    });
  } catch (error) {
    console.error("backfillProfileFields error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


module.exports = {
  userRegister,
  login,
  logout,
  getalluser,
  forgettpass,
  verifyOtp,
  verifyandResetPassword,
  deleteUser,
  getSingleUser,
  getAllUserByDepartment,
  editUser,
  getAllDepartment,
  finalizeBdLogin,
  backfillProfileFields,
};
