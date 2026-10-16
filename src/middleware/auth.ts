import { adminAuth } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  name?: string;
  token: DecodedIdToken;
}

export async function verifyAuthHeader(authHeader: string | null): Promise<AuthenticatedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      token: decodedToken,
    };
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    return null;
  }
}
