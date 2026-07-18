// Kept for modules that prefer explicit wrapping; express-async-errors
// also catches rejected promises globally once required in app.js.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
