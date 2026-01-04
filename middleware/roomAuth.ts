import { prisma } from "../lib/prisma.js";

/**
 * Verify user is an active member of a room
 */
export async function verifyRoomMembership(
  userId: string,
  roomId: string
): Promise<boolean> {
  try {
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    return membership !== null && membership.isActive === true;
  } catch (error) {
    console.error("Error verifying room membership:", error);
    return false;
  }
}

/**
 * Get all active members of a room
 */
export async function getRoomMemberIds(roomId: string): Promise<string[]> {
  try {
    const members = await prisma.roomMember.findMany({
      where: {
        roomId,
        isActive: true,
      },
      select: {
        userId: true,
      },
    });

    return members.map((m) => m.userId);
  } catch (error) {
    console.error("Error getting room members:", error);
    return [];
  }
}

