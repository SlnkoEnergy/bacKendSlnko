const router = require("express").Router();
const {
  createPost,
  getPosts,
  updatePost,
  deletePost,
  addFollowers,
} = require("../Controllers/posts.controller");
const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");

router.post("/post", jwtMW.authentication, upload, createPost);
router.get("/post", jwtMW.authentication, getPosts);
router.put("/post", jwtMW.authentication, updatePost);
router.delete("/post", jwtMW.authentication, deletePost);
router.put("/follower", jwtMW.authentication, addFollowers);

module.exports = router;
