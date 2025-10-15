// ...existing code...
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  let token = req.headers["x-auth-token"];
  if (!token)
    return res
      .status(401)
      .send({ status: false, msg: "Token must be present" });

  jwt.verify(token, process.env.PASSKEY, function (err, decodedToken) {
    if (err)
      return res.status(401).send({ status: false, msg: "Token is invalid" });

    req.user = decodedToken;
    next();
  });
};
