const router = require("express").Router();
const {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendorDropwdown,
  getVendorNameSearch,
  getAllVendors,
} = require("../Controllers/vendor.controller");
const auth = require("../middlewares/auth.middleware.js");

router.post("/vendor", auth, addVendor);
router.get("/vendor", auth, getVendor);
router.get("/vendors", auth, getAllVendors);
router.put("/vendor/:_id", auth, updateVendor);
router.delete("/vendor/:_id", auth, deleteVendor);
router.get("/vendor-dropdown", auth, getVendorDropwdown);
router.get("/vendor-search", auth, getVendorNameSearch);

module.exports = router;
