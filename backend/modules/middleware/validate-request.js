'use strict';
const { ValidationError } = require('../errors');

// The v2 twin of validate.js. Same factory shape, one difference that matters: it THROWS a
// ValidationError instead of answering `res.status(400).json("Validation failed")`, so the
// response comes out in the locked error contract
// ({ error: { category, message, requestId, fields } }) and the client can bind each
// message to the field that caused it.
//
// validate.js is deliberately left alone — legacy frontends parse its bare string body, so
// changing it would break pages this rebuild is not allowed to touch yet.
//
// Usage (in a routes file):
//   router.post('/classes', validateRequest(createClassSchema, 'academic-setup'), CreateClass);
//   router.get('/students', validateRequest(listSchema, 'student', 'query'), ListStudents);
//
// `source` defaults to 'body'; pass 'query' to validate (and normalize) a GET's query string.
const validateRequest = (schema, module, source = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,   // report every bad field at once, not just the first
            stripUnknown: true,
        });

        if (error) {
            // Joi reports a path per detail; a whole-array rule (e.g. "two streams have the
            // same name") reports an empty path, so fall back to the label and then to a
            // form-level marker rather than emitting a blank field name.
            const fields = error.details.map((detail) => ({
                field: detail.path.join('.') || detail.context?.label || 'form',
                message: detail.message.replace(/"/g, ''),
            }));

            return next(new ValidationError('Please fix the highlighted fields', { module, fields }));
        }

        // req.query is a getter in newer Express versions; assigning the normalized copy
        // property-by-property works on both.
        if (source === 'query') {
            Object.keys(req.query).forEach((key) => delete req.query[key]);
            Object.assign(req.query, value);
        } else {
            req[source] = value;
        }
        return next();
    };
};

module.exports = validateRequest;
