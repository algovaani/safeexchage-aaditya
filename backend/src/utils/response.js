function timestamp() {
  return new Date().toISOString();
}

export function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errors: null,
    timestamp: timestamp(),
  });
}

export function error(res, message = 'Error', statusCode = 400, errors = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errors,
    timestamp: timestamp(),
  });
}

/** @deprecated Use success(res, data, message, statusCode) */
export function sendSuccess(res, message, data = null, status = 200) {
  return success(res, data, message, status);
}

/** @deprecated Use error(res, message, statusCode, errors) */
export function sendError(res, message, status = 400, payload = null) {
  const errors = payload?.errors ?? (Array.isArray(payload) ? payload : null);
  return error(res, message, status, errors);
}
