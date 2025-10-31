const router = require("express").Router();
const {
  createPost,
  getPosts,
  updatePost,
  deletePost,
  addFollowers,
  removeFollowers,
} = require("../Controllers/posts.controller");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");

router.post("/post", auth, upload, createPost);
router.get("/post", auth, getPosts);
router.put("/post", auth, upload, updatePost);
router.delete("/post", auth, deletePost);
router.put("/follow", auth, addFollowers);
router.put("/unfollow", auth, removeFollowers);

module.exports = router;
