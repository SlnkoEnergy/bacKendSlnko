const router = require("express").Router();
const {
  createPost,
  getPosts,
  updatePost,
  deletePost,
  addFollowers,
  removeFollowers,
} = require("../Controllers/posts.controller");
const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");

router.post("/post", jwtMW.authentication, upload, createPost);
router.get("/post", jwtMW.authentication, getPosts);
router.put("/post", jwtMW.authentication, upload, updatePost);
router.delete("/post", jwtMW.authentication, deletePost);
router.put("/follow", jwtMW.authentication, addFollowers);
router.put('/unfollow', jwtMW.authentication, removeFollowers);

module.exports = router;
