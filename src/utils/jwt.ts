import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';
import { config } from '../config/env.js';

export type AuthRole = 'admin' | 'user';

export interface AuthPayload {
  sub: string;
  role: AuthRole;
}

export const signToken = (payload: AuthPayload): string => {
  const secret: Secret = config.JWT_SECRET;
  const options: SignOptions = {
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret, options);
};

export const signRefreshToken = (payload: AuthPayload): string => {
  const secret: Secret = config.JWT_REFRESH_SECRET;
  const options: SignOptions = {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret, options);
};

export const verifyRefreshToken = (token: string): AuthPayload => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as AuthPayload;
};
