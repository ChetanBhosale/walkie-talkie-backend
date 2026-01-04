import { prisma } from "../lib/prisma.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface AuthUser {
  userId: string;
  username: string;
  roomId: string;
}

/**
 * Verify JWT token and return user info
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string; roomId: string };
    
    // Check if session exists and is valid
    const session = await prisma.session.findFirst({
      where: {
        token: token,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return null;
    }

    return {
      userId: decoded.userId,
      username: decoded.username,
      roomId: decoded.roomId,
    };
  } catch (error) {
    console.error("Token verification error:", error);
    return null;
  }
}

/**
 * Generate JWT token
 */
export function generateToken(userId: string, username: string, roomId: string): string {
  return jwt.sign(
    { userId, username, roomId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

