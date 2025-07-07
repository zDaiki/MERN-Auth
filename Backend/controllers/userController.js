import userModel from "../models/userModel.js";

export const getUserData = async(req, res)=>{
    try {
        const user = await userModel.findById(req.userId);

        if(!user){
            return res.json({success: false, message: "User not found"});
        }

        res.json({success: true, userData:{
            id: user._id,
            name: user.name,
            isAccountVerified: user.isAccountVerified
        }});

    } catch (error) {
        return res.json({success: false, message: error.message});
    }
}