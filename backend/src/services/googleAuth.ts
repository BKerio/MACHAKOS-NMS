import { OAuth2Client, TokenPayload } from 'google-auth-library';

/**
 * Verifies a Google ID token from web (GIS) or mobile (google_sign_in).
 * Audience must match one of the configured OAuth client IDs (web / Android / iOS).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientIds: string[]
): Promise<TokenPayload> {
  if (!clientIds.length) {
    throw new Error('Google Sign-In is not configured on the server');
  }

  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientIds,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google ID token');
  }

  return payload;
}

/** Comma-separated GOOGLE_CLIENT_IDS → trimmed non-empty list. */
export function parseGoogleClientIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
