const attempts = new Map();

function rateLimit({ windowMs, max, key = (req) => req.ip || "unknown" }) {
  return (req, res, next) => {
    const now = Date.now();
    const id = `${key(req)}:${req.path}`;
    const current = attempts.get(id);

    if (!current || current.resetAt <= now) {
      attempts.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many requests. Try again later." });
    }

    next();
  };
}

module.exports = { rateLimit };
