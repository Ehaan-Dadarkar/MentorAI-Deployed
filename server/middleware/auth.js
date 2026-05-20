const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    Promise.resolve(
      User.findById(decoded.userId).select(
        "name email subjects studyGoalMinutes streak lastStudyDate weakTopics openrouterApiKey isDemo",
      ),
    )
      .then((user) => {
        if (!user) {
          return res.status(401).json({ success: false, message: "Invalid token" });
        }

        req.user = user.toObject();
        next();
      })
      .catch(next);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

module.exports = auth;
