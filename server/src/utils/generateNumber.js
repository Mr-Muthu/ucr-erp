// Simple human-readable sequence numbers, e.g. BK-20260718-4F2A
function generateNumber(prefix) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

module.exports = generateNumber;
