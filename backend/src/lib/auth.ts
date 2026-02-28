import type { Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'taxalpha_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  sub: string;
}

export function createSessionToken(userId: string, secret: string, expiresIn: string): string {
  const options: SignOptions = {
    subject: userId,
    expiresIn: expiresIn as SignOptions['expiresIn']
  };

  return jwt.sign({}, secret, options);
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === 'string' || !payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response, token: string, isProduction: boolean): void {
  response.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  });
}

export function clearSessionCookie(response: Response, isProduction: boolean): void {
  response.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/'
  });
}
