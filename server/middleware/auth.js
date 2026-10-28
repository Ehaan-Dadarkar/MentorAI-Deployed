const { verifyToken } = require("../services/jwt");
const User = require("../models/User");

const auth = (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const decoded = verifyToken(token);
    req.userId = decoded.userId;

    Promise.resolve(
      User.findById(decoded.userId).select(
        "name email subjects studyGoalMinutes streak lastStudyDate weakTopics openrouterApiKey isDemo tokenVersion",
      ),
    )
      .then((user) => {
        if (!user) {
          return res.status(401).json({ success: false, message: "Invalid token" });
        }

        // Session revocation (Backend M8): a token whose version no
        // longer matches the user was issued before a logout-everywhere
        // or password change, so it is dead even though its signature
        // and expiry are still valid. Tokens issued before tokenVersion
        // existed carry no version claim and read as 0, matching a user
        // that has never bumped.
        if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
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
