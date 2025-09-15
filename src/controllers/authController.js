const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const dotenv = require('dotenv').config();
const UserSchema = require("../model/userModel");
const logAudit = require('../utils/auditlogger');
const tokenBlacklist = require("../utils/blackList");

exports.login = async (req, res) => {
    try {
        const { username, password,descriptor } = req.body;

        if(descriptor){
          const allUsers = await UserSchema.find({}, { descriptor: 1, username: 1, role: 1, fullname: 1 });
          function euclideanDistance(desc1, desc2) {
            let sum = 0;
            for (let i = 0; i < desc1.length; i++) {
                let diff = desc1[i] - desc2[i];
                sum += diff * diff;
            }
            return Math.sqrt(sum);
        }
        let bestMatch = null;
        let minDistance = Infinity;

        for (const user of allUsers) {
            if (!user.descriptor || user.descriptor.length !== descriptor.length) continue;

            const dist = euclideanDistance(user.descriptor, descriptor);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = user;
            }
        }
         const MATCH_THRESHOLD = 0.4;
         
          if (!bestMatch || minDistance > MATCH_THRESHOLD) {
            return res.status(400).json({ message: "Face not recognized" });
        }

         const token = jwt.sign(
            { id: bestMatch.id, username: bestMatch.username, role: bestMatch.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

         await logAudit({
            user: { id: bestMatch.id, username: bestMatch.username },
            username: bestMatch.username,
            action: 'LOGIN',
            targetModel: 'User',
            targetId: bestMatch._id,
            description: `User ${bestMatch.username} logged in via face recognition`
        });

        return res.json({
            token,
            user: {
                id: bestMatch.id,
                username: bestMatch.username,
                fullName: bestMatch.fullname,
                role: bestMatch.role
            },
            distance: minDistance
        });
        }

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password required" });
        }

        const user = await UserSchema.findOne({ username })
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logAudit({
            user: { id: user.id, username: user.username },
            username: user.username,
            action: 'LOGIN',
            targetModel: 'User',
            targetId: user._id,
            description: `User ${user.username} logged in`
        });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullname,
                role: user?.role
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
}


exports.logout = async (req, res) => {
  try {
    const user = req.user;
    const token = req.headers.authorization?.split(" ")[1];

    if (!user || !token) {
      return res.status(401).json({ message: "Unauthorized: No user or token found" });
    }

    // Add token to blacklist
    tokenBlacklist.add(token);

    await logAudit({
      user: { id: user.id, username: user.username },
      username: user.username,
      action: 'LOGOUT',
      targetModel: 'User',
      targetId: user.id,
      description: `User ${user.username} logged out`
    });

    res.status(200).json({ message: "Logout successful" });

  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};