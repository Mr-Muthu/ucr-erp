import rateLimit from 'express-rate-limit';

// Applied to login endpoints only. Account-level lockout (failedLoginAttempts
// + lockedUntil on User/DriverAccount) is the second, independent layer of
// defense — this just throttles brute-force attempts by IP.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' },
});

// Applied to the whole API as a coarse ceiling against runaway clients (a
// broken sync loop on the driver app, a misbehaving script) — generous
// enough not to bother real usage, since per-endpoint limits like
// authRateLimiter above handle the sensitive cases specifically.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
});
