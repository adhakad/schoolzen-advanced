'use strict';
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true, // extra fields remove
        });

        if (error) {
            console.log(error.details.map((err) => err.message))
            return res.status(400).json("Validation failed");
        }

        req.body = value;
        next();
    };
};

module.exports = validate;
