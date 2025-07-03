const router = require("express").Router();
const {
    CreateMaterialSupply,
     getAllMaterial,
}= require("../../Controllers/materialSupplyController/materialSupplyController");
const jwtMW = require("../../middlewares/auth");
router.post("/material-supply", jwtMW.authentication, jwtMW.authorization,CreateMaterialSupply );
router.get("/material-supply", jwtMW.authentication, jwtMW.authorization, getAllMaterial);


module.exports = router;