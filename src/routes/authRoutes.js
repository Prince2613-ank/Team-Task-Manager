import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { loginSchema, signupSchema, validate } from '../validators.js';

export const authRouter = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

authRouter.post('/signup', async (req, res, next) => {
  try {
    const data = validate(signupSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const { rows } = await query(
      `
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, created_at AS "createdAt"
      `,
      [data.name, data.email, passwordHash]
    );
    const user = rows[0];

    res.status(201).json({
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === '23505') {
      next(new HttpError(409, 'An account with this email already exists'));
      return;
    }

    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const data = validate(loginSchema, req.body);
    const { rows } = await query(
      'SELECT id, name, email, password_hash, created_at AS "createdAt" FROM users WHERE email = $1',
      [data.email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    res.json({
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
