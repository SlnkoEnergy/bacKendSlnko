function getEmailTemplate(otp) {
  return `
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
`}

function getEmailTemplateResgister(name, email, password) {
  return `
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
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; padding: 20px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <!-- Header -->
            <tr>
              <td style="background:#FFFFFF; padding:20px; text-align:center; color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto; white-space:nowrap;">
    <tr>
      <td valign="middle" style="padding-right:8px;">
        <img src="https://protracslnko.blob.core.windows.net/protrac/user_profile/5bd09protrac_logo.45ee838078e34cec75d5.png"
             width="100" height="auto" alt="Protrac" style="display:block;">
      </td>
      
    </tr>
  </table>
</td>

            </tr>
            <tr>
              <td style="padding: 30px; color: #333333; font-size: 15px; line-height: 1.6;">
                <p>Dear <strong>${name}</strong>,</p>
                <p>We are pleased to share your <strong>Protrac account credentials</strong>:</p>
                <ul style="padding-left: 18px;">
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>Password:</strong> ${password}</li>
                  <li><strong>Login Link:</strong> <a href="https://slnkoprotrac.com" style="color: #004aad;">https://slnkoprotrac.com</a></li>
                </ul>
                <p style="margin-top: 20px;">
                  For security purposes, we recommend changing your password immediately after your first login using the <em>Forgot Password</em> option available on the login page.
                </p>
                <p>
                  If you face any issues while accessing your account, please feel free to reach out to the <strong>IT Team</strong> for assistance.
                </p>
                <p style="margin-top: 30px;">Best regards</p>
              </td>
            </tr>
           
          </table>
        </td>
      </tr>
    </table>

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
}

module.exports = { getEmailTemplate, getEmailTemplateResgister };