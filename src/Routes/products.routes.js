const router = require("express").Router();
const { createMaterial } = require("../Controllers/material.controller");
const { addMaterialCategory } = require("../Controllers/materialcategory.controller");
const jwtMW = require("../middlewares/auth");

router.post("/category", jwtMW.authentication, addMaterialCategory);


router.post("/product", jwtMW.authentication, createMaterial);

module.exports = router;