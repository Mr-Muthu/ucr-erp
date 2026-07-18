const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'ACCOUNTANT', 'DRIVER']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function toSafeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

async function register(req, res) {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, 'A user with this email already exists');

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { ...data, password: hashed, role: data.role || 'STAFF' },
  });

  const token = signToken(user);
  res.status(201).json({ user: toSafeUser(user), token });
}

async function login(req, res) {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) throw new ApiError(401, 'Invalid email or password');

  if (user.status !== 'ACTIVE') throw new ApiError(403, 'This account is inactive');

  const token = signToken(user);
  res.json({ user: toSafeUser(user), token });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) throw new ApiError(404, 'User not found');
  res.json(toSafeUser(user));
}

module.exports = { register, login, me };
