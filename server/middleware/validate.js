const { ZodError } = require("zod");

const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = (error.errors || []).map((e) => ({
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
