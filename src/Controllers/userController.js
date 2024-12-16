const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");
const JWT_SECRET = " your-secret-key";
const nodemailer = require("nodemailer");








//user Registration
const userRegister = async function (req, res) {
  try {
    let {name,emp_id,email,phone,department,role,password} = req.body;
    
  const newuser = new userModells({
    name,emp_id,email,phone,department,role,password

  });
  await newuser.save()

    res.status(200).json({ msg: "user register sucessfully", newuser });
  } catch (error) {
    res.status(500).json({ msg: "server error" + error });
  }
};



//Forget-Password
const forgettpass = async function (req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    // Find user by email
    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Save OTP in database (optional: set expiration time)
    user.otp = otp;
    user.otpExpires = Date.now() + 15 * 60 * 1000; // OTP valid for 15 minutes
    let x= await user.save();
     console.log(x);

    // Configure the email transporter
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user:"biplavmandal.mandal@gmail.com",
        pass: "hajp dgmg mvyd ljui",
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



const verifyandSendPass = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const user = await userModells.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
      
    }
    console.log(user)

    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
    }


    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user:"biplavmandal.mandal@gmail.com",
        pass: "hajp dgmg mvyd ljui",
      },
    });

    // Send email with password
    const mailOptions = {
      from: `"SLNKO Energy Pvt. Ltd" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Registered Password",
      text: `Dear User,

Your registered password is: ${user.password}

If you did not request this email, please contact support immediately.

Best regards,
SLNKO Energy Pvt. Ltd`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "Password sent successfully to your email.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred. Please try again." });
  }
};


  
//Login
const login = async function (req, res) {
  try {
    let { name, password ,email} =req.body;
    const user = await userModells.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
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
  res.status(200).json({data:user});
};

module.exports = {
  userRegister,
  login,
  getalluser,
  forgettpass,
 verifyandSendPass,
};
