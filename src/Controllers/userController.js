const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");

const JWT_SECRET = " your-secret-key";
const nodemailer = require("nodemailer");
const { config } = require("dotenv");
config({
  path: "./.env",
});

//user Registration
const userRegister = async function (req, res) {
  try {
    let { name, emp_id, email, phone, department, role, password } = req.body;

    const newuser = new userModells({
      name,
      emp_id,
      email,
      phone,
      department,
      role,
      password,
    });
    await newuser.save();

    res.status(200).json({ msg: "user register sucessfully", newuser });
  } catch (error) {
    res.status(500).json({ msg: "server error" + error });
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
    let x = await user.save();

    // Configure the email transporter
    const transport = nodemailer.createTransport({
      host: "smtp.hostinger.com", 
      port: 465, 
      secure: false,
      service: "gmail",
      auth: {
        user: "it@slnkoenergy.com",
        pass: "ifyx hwvm qaat jpdl",
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
`



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
    res.status(500).json({ message: "An error occurred. Please try again."+error });
  }
};
//Verify-OTP-and-Send-Password
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
      host: "smtp.hostinger.com", 
      port: 465, 
      secure: false,
      service: "gmail",
      auth: {
        user: "it@slnkoenergy.com",
        pass:  "ifyx hwvm qaat jpdl",
      },
    });

    // Send email with password
    const mailOptions = {
      from: `"SLNKO Energy Pvt. Ltd" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Registered Password",
      text: `Dear User,





Best regards,
SLNKO Energy Pvt. Ltd`,
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
  <div> <p>Your registered password is:</p><h3 style="color:blue"> ${user.password},</h3></div>
  <div> <p style="color:blue">If it is not requested by you, please contact support immediately.</p></div>
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
`

    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "Password sent successfully to your email.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred. Please try again."+error });
  }
};

//Login
const login = async function (req, res) {
  try {
    let { name, password, email } = req.body;
    const user = await userModells.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });
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
  res.status(200).json({ data: user });
};


//get-single-user
const getSingleUser = async function (req, res) {
  const userId = req.params._id;

  try {
    const user = await userModells.findById(userId).select('-otp -otpExpires -password  -id  -duration  -_id');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user", error: error.message });
  }
};

module.exports = {
  userRegister,
  login,
  getalluser,
  forgettpass,
  verifyandSendPass,
  deleteUser,
  getSingleUser,
};
