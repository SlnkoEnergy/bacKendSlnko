const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { config } = require("dotenv");

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
      html: `
<html>
  <head>
    <title>SLnko Energy</title>
    <style>
      .fa {
        padding: 10px;
        font-size: 20px;
        width: 20px;
        text-align: center;
        text-decoration: none;
        margin: 2px 2px;
      }
      .fa:hover {
          opacity: 0.7;
      }
      .fa-facebook {
        background: #3B5998;
        color: white;
      }
      .fa-linkedin {
        background: #007bb5;
        color: white;
      }
      .fa-youtube {
        background: #bb0000;
        color: white;
      }
    </style>
  </head>
  <body>
  <div> <p>Your OTP for password reset is :</p><h3 style="color:blue"> ${otp},</h3></div>
    <div style="color:rgb(34,34,34);direction:ltr;margin:8px 0px 0px;padding:0px;font-size:0.875rem;font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif">
      <div style="font-stretch:normal;font-size:small;line-height:1.5;font-family:Arial,Helvetica,sans-serif;overflow:hidden">
        <div dir="ltr">
          <div dir="ltr">
            <div dir="ltr">
              <table cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" width="420" height="198" style="color:rgb(0,0,0);font-family:&quot;Times New Roman&quot;;font-size:medium;width:420px;height:198px;border-collapse:collapse">
                <tbody>
                  <tr>
                    <td>
                      <a href="https://slnkoenergy.com/images/Zoho.png">
                        <img width="300px" height="auto" src="https://slnkoenergy.com/images/Zoho.png" sizes="(max-width: 2807px) 100vw, 2807px" class="attachment-full size-full wp-image-142" alt="" loading="lazy">
                      </a>
                      <table cellpadding="0" cellspacing="0" width="193" height="56" style="width:193px;height:56px;border-collapse:collapse">
                        <tbody>
                          <tr>
                            <td width="293" height="58" bgcolor="#FFFFFF" valign="middle" align="center" style="width:293px;height:58px;padding:0px">
                              <p style="width:250px;font-family:&quot;sans-serif Condensed&quot;,sans-serif;font-weight:700;color:rgb(62,0,119);font-size:14px;text-transform:uppercase;letter-spacing:0px;margin:0px;padding:0px">IT TEAM</p>
                              <p style="width:293px;font-family:&quot;Roboto Condensed&quot;,sans-serif;color:rgb(44,50,59);font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0px;padding:0px">
                                <b>IT DEPARTMENT</b>
                              </p>
                             
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                    <td width="227" height="120" style="width:327px;height:120px;padding:0px">
                      <table cellpadding="0" cellspacing="0" width="393" height="100" style="width:393px;height:120px;border-collapse:collapse;border-top-color:rgb(44,50,59);border-bottom-color:rgb(44,50,59)">
                        <tbody>
                          <tr>
                            <td width="259" height="56" style="width:259px;height:46px;padding:0px">
                              <p style="width:289.062px;font-family:&quot;Roboto Condensed&quot;,sans-serif;font-size:12px;letter-spacing:0.8px;margin:0px 0px 0px 20px;padding:0px">
                                <b>Corporate Address</b><br>Second Floor B-58 B, Sector 60,<br> Noida, UP - 201301
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td width="259" height="52" style="width:259px;height:32px;padding:0px">
                              <p style="width:289.062px;font-family:&quot;Roboto Condensed&quot;,sans-serif;font-size:12px;letter-spacing:0.8px;margin:0px 0px 0px 20px;padding:0px">
                                <a href="mailto:info@slnkoenergy.com" target="_blank">info@SLnkoenergy.com</a>
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td width="259" height="56" style="width:259px;height:36px;padding:0px">
                              <p style="width:289.062px;font-family:&quot;Roboto Condensed&quot;,sans-serif;font-size:12px;letter-spacing:0.8px;margin:0px 0px 0px 20px;padding:0px">
                                <a href="https://slnkoenergy.com/">https://slnkoenergy.com/</a>
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td colspan="2">
                              <p style="margin:0px 0px 0px 20px">Follow us on:
                                <a href="https://www.facebook.com/SLNKOENERGY?mibextid=ZbWKwL"><img width="20px" height="20px" src="https://slnkoenergy.com/images/facebook.png"></a>
                                <a href="https://www.linkedin.com/company/slnkoenergy/"><img width="20px" height="20px" src="https://slnkoenergy.com/images/linkedin.png"></a>
                                <a href="https://www.instagram.com/slnkoenergy?igsh=MXN2ZHVkZHF4OXNxeQ=="><img width="20px" height="20px" src="https://slnkoenergy.com/images/instagram.png"></a>
                                <a href="https://youtube.com/@slnkoenergy6969?si=LBUYkdvdYDLNg69s"><img width="20px" height="20px" src="https://slnkoenergy.com/images/youtube.png"></a>
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              	<table cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" width="620" height="15" style="width:620px;height:15px;border-collapse:collapse">
  			<tbody>
  				<tr valign="middle" align="center">
					 <a href="https://slnkoenergy.com/images/slogan.png" ><img width="620px" align="center" src="https://slnkoenergy.com/images/slogan.png"></a>
					</tr>
  			</tbody>
  		</table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`,
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

//Verify-OTP-and-Send-Password
const verifyandResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({
          message:
            "Email, OTP, new password, and confirm password are required.",
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

    // Check if OTP matches
    if (user.otp !== parseInt(otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // Check if OTP has expired
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP has expired." });
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

    // Combine all identity fields into a single search term
    const identity = name || emp_id || email;

    if (!identity) {
      return res
        .status(400)
        .json({ msg: "Enter any of username, emp_id, or email" });
    }

    // Search user where ANY of the fields match the identity value
    const user = await userModells.findOne({
      $or: [
        { name: identity },
        { emp_id: identity },
        { email: identity }
      ]
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
  verifyandResetPassword,
  deleteUser,
  getSingleUser,
};
