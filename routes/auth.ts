import { prisma } from "../lib/prisma.js";
import bcrypt from "bcrypt";
import { generateToken, verifyToken } from "../middleware/auth.js";

/**
 * Generate a random 5-digit room ID
 */
function generateRoomId(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * POST /api/auth/signup
 * Create a new user and room
 */
export async function signup(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Username already exists" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user, room, and room member in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
        },
      });

      // Generate unique room ID
      let roomId = generateRoomId();
      let roomExists = await tx.room.findUnique({ where: { id: roomId } });
      while (roomExists) {
        roomId = generateRoomId();
        roomExists = await tx.room.findUnique({ where: { id: roomId } });
      }

      // Create room
      const room = await tx.room.create({
        data: {
          id: roomId,
          name: `Room ${roomId}`,
          createdBy: user.id,
        },
      });

      // Add user as room member
      await tx.roomMember.create({
        data: {
          userId: user.id,
          roomId: room.id,
          isActive: true,
        },
      });

      // Generate JWT token
      const token = generateToken(user.id, user.username, room.id);

      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await tx.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      return { user, room, token };
    });

    return new Response(
      JSON.stringify({
        token: result.token,
        user: {
          id: result.user.id,
          username: result.user.username,
        },
        room: {
          id: result.room.id,
          name: result.room.name,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/auth/login
 * Login user and join/create room
 */
export async function login(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { username, password, roomId } = body;

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    let room;
    let finalRoomId: string;

    if (roomId) {
      // Join existing room
      room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return new Response(
          JSON.stringify({ error: "Room not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      finalRoomId = room.id;

      // Check if user is already a member
      const existingMember = await prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: user.id,
            roomId: room.id,
          },
        },
      });

      // Add user to room if not already a member
      if (!existingMember) {
        await prisma.roomMember.create({
          data: {
            userId: user.id,
            roomId: room.id,
            isActive: true,
          },
        });
      } else if (!existingMember.isActive) {
        // Reactivate if previously left
        await prisma.roomMember.update({
          where: { id: existingMember.id },
          data: { isActive: true },
        });
      }
    } else {
      // Find user's active room or create one
      const activeMember = await prisma.roomMember.findFirst({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          room: true,
        },
      });

      if (activeMember) {
        room = activeMember.room;
        finalRoomId = room.id;
      } else {
        // Create new room for user
        let newRoomId = generateRoomId();
        let roomExists = await prisma.room.findUnique({ where: { id: newRoomId } });
        while (roomExists) {
          newRoomId = generateRoomId();
          roomExists = await prisma.room.findUnique({ where: { id: newRoomId } });
        }

        room = await prisma.room.create({
          data: {
            id: newRoomId,
            name: `Room ${newRoomId}`,
            createdBy: user.id,
          },
        });

        await prisma.roomMember.create({
          data: {
            userId: user.id,
            roomId: room.id,
            isActive: true,
          },
        });

        finalRoomId = room.id;
      }
    }

    // Generate JWT token
    const token = generateToken(user.id, user.username, finalRoomId);

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return new Response(
      JSON.stringify({
        token,
        user: {
          id: user.id,
          username: user.username,
        },
        room: {
          id: room.id,
          name: room.name,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/auth/logout
 * Logout user and invalidate session
 */
export async function logout(req: Request): Promise<Response> {
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

    // Delete session
    await prisma.session.deleteMany({
      where: { token },
    });

    // Deactivate room membership (don't delete, just mark inactive)
    await prisma.roomMember.updateMany({
      where: {
        userId: user.userId,
        roomId: user.roomId,
      },
      data: {
        isActive: false,
      },
    });

    return new Response(
      JSON.stringify({ message: "Logged out successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Logout error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /api/auth/me
 * Get current user info
 */
export async function getMe(req: Request): Promise<Response> {
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

    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });

    const room = await prisma.room.findUnique({
      where: { id: user.roomId },
      select: {
        id: true,
        name: true,
      },
    });

    return new Response(
      JSON.stringify({
        user: userData,
        room,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get me error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

