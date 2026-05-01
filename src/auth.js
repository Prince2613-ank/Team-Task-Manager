import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { HttpError } from './errors.js';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required. Set it to a long random value in your environment.');
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Authentication required');
    }

    const payload = jwt.verify(token, jwtSecret);
    const { rows } = await query(
      'SELECT id, name, email, created_at AS "createdAt" FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!rows.length) {
      throw new HttpError(401, 'Authentication required');
    }

    req.user = rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new HttpError(401, 'Session expired. Please log in again.'));
      return;
    }

    next(error);
  }
}
