const userModells = require("../Modells/userModells");
const jwt = require("jsonwebtoken");
 const JWT_SECRET = " your-secret-key";
 const nodemailer =require("nodemailer");





const userRegister = async function (req, res) {
    try {
        let data = req.body;
        let savedData = await userModells.create(data);
        res.status(200).json({ msg: "user register sucessfully", savedData });
    } catch (error) {
        res.status(500).json({ msg: "server error" + error });
    }
};








const login = async function (req,res) {
    try {
        let { name, password } =req.body;
        let user = await userModells.findOne({name});
        if (!user || user.password !== password) {
            return res.status(401).json({ error: "Invalid Credentials" });
        }
        
        let token = jwt.sign({userID: user._id}, JWT_SECRET , {expiresIn:  "1h"});
        res.json({token, userID : user._id})
        

        
    } catch (error) {
        res.status(400).json({msg:"Invalid user"+ error});
    }
    
}

const getalluser = async function(req,res){
    let user = await  userModells.find();
    res.status(200).json(user);


}




module.exports = {
    userRegister,
    login,
    getalluser,
    
};