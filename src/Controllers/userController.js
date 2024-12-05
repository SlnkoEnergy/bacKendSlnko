const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");
const JWT_SECRET = " your-secret-key";
const nodemailer = require("nodemailer");
require("dotenv").config();

const userCredential =process.env.user
const userPass=process.env.pass






//user Registration
const userRegister = async function (req, res) {
  try {
    let data = req.body;
    let savedData = await userModells.create(data);
    res.status(200).json({ msg: "user register sucessfully", savedData });
  } catch (error) {
    res.status(500).json({ msg: "server error" + error });
  }
};



//Forget-Password
const forgettpass = async function (req, res) {
  try {
    const { email } = req.body;

    if ( !email) {
      return res.status(400).json({ message: "Invalid credential" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    const user = await userModells.findOneAndUpdate(
      { email },
      { otp },
      { new: true }
    );

    if (!user ) {
      return res.status(404).json({ message: "User not found." });
    }

    // Configure the email transporter
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user:userCredential,
        pass: userPass,
      },
    });

    // Send the email
    const info = await transport.sendMail({
      from: `"SLNKO Energy Pvt. Ltd" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for Password Reset",
      text: `Your OTP for password reset is: ${otp}`,
    });

    transport.sendMail(info, (err) => {
      if (err) {
        console.log(err);
      }

      res.status(200).json({
        message: "OTP sent successfully. Please check your email.",
        email,
        otp, // In production, avoid exposing the OTP in the response.
        userID: user._id,
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred. Please try again." });
  }
};


//reset-password 
const resetpassword = async function (req, res) {
    try {
      const { email, otp, newpassword } = req.body;
  
      // Find the user by email and otp
      const user = await userModells.findOne({ email:email, otp: otp }); // Use findOne for a single document
  
      // Check if the user exists
      if (!user) {
        return res.status(400).json({ msg: "Invalid credential" });
      }
  
      // Update the user's password and clear the OTP
      user.password = newpassword;
      user.otp = null;
  
      // Save the updated user document
       let d =await user.save(); // Correct method name is `save()`
      console.log(d)
  
      // Respond with success
      res.status(200).json({ msg: "Password reset successfully" });
  
    } catch (error) {
      console.log(error);
      res.status(500).json({ msg: "Server error" });
    }
  };
  
//Login
const login = async function (req, res) {
  try {
    let { name, password } = req.body;
    let user = await userModells.findOne({ name });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid Credentials" });
    }

    let token = jwt.sign({ userID: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, userID: user._id });
  } catch (error) {
    res.status(400).json({ msg: "Invalid user" + error });
  }
};


//get-all-user
const getalluser = async function (req, res) {
  let user = await userModells.find();
  res.status(200).json(user);
};

module.exports = {
  userRegister,
  login,
  getalluser,
  forgettpass,
  resetpassword,
};
