import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'buku_jabatan_secret_key_123';

export interface UserPayload {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

// Extend Request interface to include user
export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export function generateToken(user: UserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Sesi kedaluwarsa atau token tidak valid.' });
    }
    req.user = decoded as UserPayload;
    next();
  });
}

// Like authenticateToken, but does not reject the request when no/invalid token is present.
// Handlers can check req.user to decide how much detail to return.
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.user = decoded as UserPayload;
    }
    next();
  });
}

export function requireRole(allowedRoles: ('admin' | 'editor' | 'viewer')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Pengguna tidak terautentikasi.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Hak akses tidak mencukupi untuk melakukan tindakan ini.' });
    }

    next();
  };
}
