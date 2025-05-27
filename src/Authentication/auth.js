const jwt = require("jsonwebtoken");

const authentication = async function (req, res, next) {
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

const authorization = async function (req, res, next) {


    const token = req.headers["x-auth-token"];
  if (!token) {
    return res.status(401).send({ status: false, msg: "Token must be provided" });
  }

  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.PASSKEY);
  } catch (err) {
    return res.status(401).send({ status: false, msg: "Invalid token" });
  }
 if (req.params.userId && String(decodedToken.userId) !== String(req.params.userId)) {
    return res.status(403).send({ status: false, msg: "UserId or token is wrong" });

  }
  req.user = decodedToken;
  next();
};

module.exports = { authentication, authorization };
