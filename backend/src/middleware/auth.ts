import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';

// Extend Express Request to carry the verified user
declare global {
  namespace Express {
    interface Request {
      user?: {
        did: string;     // Privy DID e.g. "did:privy:xyz..."
        appId: string;
      };
    }
  }
}

// Initialize Privy server client once (module-level singleton)
const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

/**
 * Express middleware: verifies a Privy auth token from the
 * Authorization: Bearer <token> header.
 *
 * On success: attaches `req.user.did` and calls next().
 * On failure: returns 401 Unauthorized.
 */
export async function verifyPrivyToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const verifiedClaims = await privy.verifyAuthToken(token);

    req.user = {
      did:   verifiedClaims.userId,  // Privy DID
      appId: verifiedClaims.appId,
    };

    next();
  } catch (err: any) {
    console.error('[Privy Auth] Token verification failed:', err?.message ?? err);
    res.status(401).json({ success: false, error: 'Unauthorized: invalid or expired token' });
  }
}

export { privy };
