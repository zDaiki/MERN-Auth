import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import transporter from '../config/nodemailer.js';
import { EMAIL_VERIFY_TEMPLATE, PASSWORD_RESET_TEMPLATE } from '../config/emailTemplates.js';

export const register = async (req, res)=>{
    const {name, email, password} = req.body;

    if(!name || !email || !password){
        return res.json({success: false, message: "missing Details"})
    }

    try {
        const existingUser = await userModel.findOne({email})

        if(existingUser){
            return res.json({success: false, message: "User already exists"});
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new userModel({name, email, password: hashedPassword});
        await user.save();

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, {expiresIn: '7d'});

        res.cookie('token', token,{
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ?
            'none' : 'strict',
            maxAge: 7*24*60*60*1000
        });

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Welcome to the new world',
            text: `welcome to the new world. Your account has been created with email id: ${email}`
        }
        await transporter.sendMail(mailOptions);

        return res.json({success: true});

    } catch (error) {
        res.json({success: false, message: error.message})
    }
}

export const login = async (req, res)=>{
    const {email, password} = req.body;

    if(!email || !password){
        return res.json({success: false, message: "Email and password required"})
    }
    try {
        const user = await userModel.findOne({email});

        if(!user){
            return res.json({success: false, message: "Invalid email"})
        }
        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch){
            return res.json({success: false, message: 'Invalid password'})
        }

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, {expiresIn: '7d'});

        res.cookie('token', token,{
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ?
            'none' : 'strict',
            maxAge: 7*24*60*60*1000
        });

        return res.json({success: true, user});

    } catch (error) {
        res.json({success: false, message: error.message});
    }
}

export const logout = async(req, res)=>{
    try {
        res.clearCookie('token',{
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ?
            'none' : 'strict',
            maxAge: 7*24*60*60*1000
        });

        return res.json({success: true, message: 'Logged out'});

    } catch (error) {
        res.json({success: false, message: error.message});
    }
}

export const sendVerifyOtp = async(req, res)=>{
    try {
        const {userId} = req.body;
        const user = await userModel.findById(userId);

        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        if(user.isAccountVerified){
            return res.json({success: false, message: "Account is already verified"})   
        }

       const otp = String(Math.floor(100000 + Math.random()*900000));

       user.verifyOtp = otp;
       user.verifyOtpExpireAt = Date.now() + 24*60*60*1000

       await user.save();

       const mailOptions = {
        from: process.env.SMTP_USER,
        to: user.email,
        subject: "Account verification OTP",
        // text: `Your OTP is ${otp}. Verify your account using this OTP.`,
        html: EMAIL_VERIFY_TEMPLATE.replace("{{otp}}",otp).replace("{{email}}",user.email)
       }
       await transporter.sendMail(mailOptions);
       res.json({success: true, message: "verification OTP sent to Email"});

    } catch (error) {
        res.json({success: false, message: error.message});
    }
} 

export const verifyEmail = async(req, res)=>{

    const userId = req.userId;  
    const { otp } = req.body;
        
    if(!userId || !otp){
        return res.json({success: false, message: "missing Deatils"});
    }

    try {
        const user = await userModel.findById(userId);
        if(!user){
            return res.json({success: false, message: "user not found"});
        }

        if(user.verifyOtp === '' || user.verifyOtp !== otp){
            return res.json({success: false, message: "Invalid OTP"});
        }

        if(user.verifyOtpExpireAt < Date.now()){
            return res.json({success: false, message: "OTP expired"});
        }

        user.isAccountVerified = true;
        user.verifyOtp= "";
        user.verifyOtpExpireAt= 0;

        await user.save();
        return res.json({success: true, message: "Email verified successfully"});

    } catch (error) {
        res.json({success: false, message: error.message});
    }
}

//check if user is authenticated
export const isAuthenticated = (req, res)=>{
    try {
        return res.json({success: true});
    } catch (error) {
        res.json({success: false, message: error.message});
    }
}

//send password reset otp
export const sendResetOtp = async(req, res)=>{
    const {email} = req.body;
    
    if(!email){
        return res.json({success: false, message: 'email is required'});
    }
    try {
        const user = await userModel.findOne({email});
        if(!user){
            return res.json({success: false, message: 'User not found'});
        }

       const otp = String(Math.floor(100000 + Math.random()*900000));

       user.resetOtp = otp;
       user.resetOtpExpireAt = Date.now() + 15*60*60*1000

       await user.save();

       const mailOptions = {
        from: process.env.SMTP_USER,
        to: user.email,
        subject: "Password reset OTP",
        // text: `Your OTP for resetting your password is ${otp}. Use this OTP to proceed with resetting password.`,
        html: PASSWORD_RESET_TEMPLATE.replace("{{otp}}",otp).replace("{{email}}",user.email)

       }
       await transporter.sendMail(mailOptions);
       return res.json({success: true, message: "OTP sent to your email"});

    } catch (error) {
        return res.json({success: false, message: error.message}); 
    }
}

//reset user password
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.json({ success: false, message: "Email, OTP, and new password are required" });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    console.log("Stored reset OTP:", user.resetOtp);
    console.log("Received OTP:", otp);
    console.log("OTP expiry time:", new Date(user.resetOtpExpireAt));
    console.log("Current time:", new Date());

    if (!user.resetOtp || user.resetOtp.trim() !== otp.trim()) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();

    return res.json({ success: true, message: "Password has been reset successfully" });

  } catch (error) {
    console.error("resetPassword error:", error);
    return res.json({ success: false, message: error.message });
  }
};
