const router = require("express").Router();
const {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendorDropwdown,
  getVendorNameSearch,
  getAllVendors,
  getVendorById,
  changeVendorNametoObjectIdInPO,
} = require("../Controllers/vendor.controller");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");

router.post("/vendor", auth, upload, addVendor);
router.get("/vendor", auth, getVendor);
router.get("/vendors", auth, getAllVendors);
router.get("/vendor/:id", auth, getVendorById);
router.put("/vendor/:id", auth, updateVendor);
router.delete("/vendor/:id", auth, deleteVendor);
router.get("/vendor-dropdown", auth, getVendorDropwdown);
router.get("/vendor-search", auth, getVendorNameSearch);
router.put('/vendor-update-names-in-po', auth, changeVendorNametoObjectIdInPO);

module.exports = router;
