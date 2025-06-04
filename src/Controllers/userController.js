const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { config } = require("dotenv");
const getEmailTemplate = require("../utils/emailTemplate");

//user Registration

const userRegister = async function (req, res) {
  try {
    let { name, emp_id, email, phone, department, role, password } = req.body;

    if (!name || !emp_id || !email || !password) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    // Check for existing user with same emp_id or email
    const existingUser = await userModells.findOne({
      $or: [{ emp_id }, { email }, { emp_id }],
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ msg: "Employee ID, Email, emp_id already exists" });
    }

    // Hash the password
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
    });

    await newuser.save();

    res.status(200).json({ msg: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Server error: " + error.message });
  }
};

//user-Deleted
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

//Forget-Password
const forgettpass = async function (req, res) {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }
    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpires = Date.now() + 15 * 60 * 1000; // OTP valid for 15 minutes
    await user.save();

    // Configure the email transporter
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

    // Send the email
    const info = await transport.sendMail({
      from: `"SLNKO Energy Pvt. Ltd" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for Password Reset",
      text: `Your OTP for password reset is: ${otp}`,
      html: getEmailTemplate(otp),
    });

    transport.sendMail(info, (err) => {
      if (err) {
        console.log(err);
      }

      res.status(200).json({
        message: "OTP sent successfully. Please check your email.",
        email,
      });
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred. Please try again." + error });
  }
};

//verify-OTP
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Validate input
    if (!otp) {
      return res.status(400).json({ message: "OTP are required." });
    }

    // Check if OTP matches
    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // Check if OTP has expired
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    return res.status(200).json({ message: "OTP verified successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
};

//Verify-OTP-and-Send-Password
const verifyandResetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    // Validate input
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

    // Find user by email
    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user record
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

//Login
const login = async function (req, res) {
  try {
    const { name, emp_id, email, password } = req.body;

    if (!password) {
      return res.status(400).json({ msg: "Password is required" });
    }

    const identity = name || emp_id || email;

    if (!identity) {
      return res
        .status(400)
        .json({ msg: "Enter any of username, emp_id, or email" });
    }

    // Search user where ANY of the fields match the identity value
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

    const token = jwt.sign({ userId: user._id }, process.env.PASSKEY);

    return res.status(200).json({ token, userId: user._id });
  } catch (error) {
    res.status(500).json({ msg: "Server error: " + error.message });
  }
};

//get-all-user
const getalluser = async function (req, res) {
  let user = await userModells.find();
  res.status(200).json({ data: user });
};

//get-single-user
const getSingleUser = async function (req, res) {
  const userId = req.params._id;

  try {
    const user = await userModells
      .findById(userId)
      .select("-otp -otpExpires -password  -id  -duration  -_id -phone -email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user", error: error.message });
  }
};

module.exports = {
  userRegister,
  login,
  getalluser,
  forgettpass,
  verifyOtp,
  verifyandResetPassword,

  deleteUser,
  getSingleUser,
};
