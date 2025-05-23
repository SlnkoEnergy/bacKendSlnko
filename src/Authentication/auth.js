const jwt = require("jsonwebtoken");

const authentication = async function (req, res, next) {
  const token = req.headers["x-auth-token"];
  console.log("Token received:", token, "| Type:", typeof token);

  if (!token || typeof token !== "string") {
    return res.status(401).send({ status: false, msg: "Token must be a string and present" });
  }

  jwt.verify(token, process.env.PASSKEY, (err, decodedToken) => {
    if (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(401).send({ status: false, msg: "Invalid token" });
    }

    req.user = decodedToken;
    next();
  });
};

const authorization = async function (req, res, next) {
  const token = req.headers["x-auth-token"];

  if (!token) {
    return res
      .status(401)
      .send({ status: false, msg: "Token must be provided" });
  }

  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.PASSKEY);
  } catch (err) {
    return res.status(401).send({ status: false, msg: "Invalid token" });
  }

  if (
    req.params.userId &&
    String(decodedToken.userId) !== String(req.params.userId)
  ) {
    return res
      .status(403)
      .send({ status: false, msg: "UserId or token is wrong" });
  }
  req.user = decodedToken;
  next();
};

module.exports = { authentication, authorization };
