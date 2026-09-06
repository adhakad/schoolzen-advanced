/**
 * Single import point for every error category — a route handler
 * anywhere in the app does:
 *   const { ValidationError, NotFoundError, ConflictError } = require('../errors');
 * never a deep path into an individual file.
 */
const AppError = require('./AppError');
const ValidationError = require('./ValidationError');
const NotFoundError = require('./NotFoundError');
const ConflictError = require('./ConflictError');
const { AuthenticationError, PermissionError } = require('./AuthAndPermissionErrors');
const RateLimitError = require('./RateLimitError');
const { ExternalServiceError, InternalError } = require('./ExternalAndInternalErrors');

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  PermissionError,
  RateLimitError,
  ExternalServiceError,
  InternalError
};
