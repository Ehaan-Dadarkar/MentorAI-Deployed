const { ZodError } = require("zod");

const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Assign the parsed output: Zod strips unknown keys, so a body
      // field such as userId or deckId can never reach a create/update
      // (Backend M3). Handlers below still destructure allowlisted
      // fields as defence in depth.
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = ((error.issues ?? error.errors) || []).map((e) => ({
          field: e.path?.join(".") || "unknown",
          message: e.message || "Invalid value",
        }));
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          details: formattedErrors,
        });
      }
      next(error);
    }
  };
};

module.exports = validate;
