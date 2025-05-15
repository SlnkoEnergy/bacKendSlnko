const jwt = require("jsonwebtoken");

const authentication = async function (req, res, next) {
  let token = req.headers["x-auth-token"];
  if (!token)
    return res
      .status(401)
      .send({ status: false, msg: "Token must be present" });

  jwt.verify(token, " your-secret-key", function (err, decodedToken) {
    if (err)
      return res.status(401).send({ status: false, msg: "Token is invalid" });

    req.user = decodedToken; // attach user data to request
    next();
  });
  // if (!decodedToken){
  //   return res.send({ status: false, msg: "Token is invalid" });
  // }
  // else {next()}
};

const authorization = async function (req, res, next) {
  let token = req.headers["x-Auth-token"];
  if (!token) token = req.headers["x-auth-token"];

  let decodedToken = jwt.verify(token, " your-secret-key");
  if (decodedToken.userId !== req.params.userId) {
    return res.send({ status: false, msg: "UserId or Token is Wrong" });
  } else {
    next();
  }
};

module.exports = { authentication, authorization };
