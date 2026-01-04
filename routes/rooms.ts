import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.js";

/**
 * GET /api/rooms/:roomId/members
 * Get all active members in a room
 */
export async function getRoomMembers(req: Request, roomId: string): Promise<Response> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const user = await verifyToken(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify user is member of the room
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: user.userId,
          roomId,
        },
      },
    });

    if (!membership || !membership.isActive) {
      return new Response(
        JSON.stringify({ error: "You are not a member of this room" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get all active members
    const members = await prisma.roomMember.findMany({
      where: {
        roomId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    return new Response(
      JSON.stringify({
        members: members.map((m) => ({
          id: m.user.id,
          username: m.user.username,
          joinedAt: m.joinedAt,
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get room members error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/rooms/join
 * Join a room
 */
export async function joinRoom(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const user = await verifyToken(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { roomId } = body;

    if (!roomId) {
      return new Response(
        JSON.stringify({ error: "Room ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return new Response(
        JSON.stringify({ error: "Room not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: user.userId,
          roomId,
        },
      },
    });

    if (existingMember) {
      if (existingMember.isActive) {
        return new Response(
          JSON.stringify({ error: "You are already a member of this room" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        // Reactivate membership
        await prisma.roomMember.update({
          where: { id: existingMember.id },
          data: { isActive: true },
        });
      }
    } else {
      // Create new membership
      await prisma.roomMember.create({
        data: {
          userId: user.userId,
          roomId,
          isActive: true,
        },
      });
    }

    return new Response(
      JSON.stringify({
        message: "Joined room successfully",
        room: {
          id: room.id,
          name: room.name,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Join room error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

