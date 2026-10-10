function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Administrator access required" });
  next();
}

module.exports = { requireAdmin };
