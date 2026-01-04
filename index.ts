import RedisService from "./services/RedisService.js";
import { handleAudioChunk, AUDIO_CHANNEL, type AudioChunkMessage } from "./handlers/audioHandler.js";
import { verifyToken } from "./middleware/auth.js";
import * as authRoutes from "./routes/auth.js";
import * as roomRoutes from "./routes/rooms.js";

const PORT = process.env.PORT || 4000;

// Store connected WebSocket clients by userId -> WebSocket
const connectedClients = new Map<string, any>();
// Store room members: roomId -> Set<userId>
const roomMembers = new Map<string, Set<string>>();

// Initialize Redis service
const redisService = RedisService.getInstance();

// Set up Redis subscription for audio broadcasting
// Note: Currently using direct broadcast fallback since RedisService is a stub
// In production with real Redis, this would handle pub/sub broadcasting
async function setupRedisSubscription() {
  try {
    await redisService.connect();
    
    // Subscribe to audio channel and broadcast to all connected clients
    // This callback would be triggered by Redis pub/sub in a real implementation
    await redisService.subscribe(AUDIO_CHANNEL, (message: string) => {
      try {
        const audioData: AudioChunkMessage = JSON.parse(message);
        
        // Broadcast to all connected clients except the sender
        let broadcastCount = 0;
        connectedClients.forEach((ws, deviceId) => {
          if (deviceId !== audioData.deviceId) {
            // Check if WebSocket is open (readyState 1 = OPEN)
            if (ws.readyState === 1) {
              try {
                ws.send(message);
                broadcastCount++;
              } catch (error) {
                console.error(`Error sending to client ${deviceId}:`, error);
                // Remove disconnected client
                connectedClients.delete(deviceId);
              }
            } else {
              // Remove closed/closing clients
              connectedClients.delete(deviceId);
            }
          }
        });
        
        if (broadcastCount > 0) {
          console.log(`Redis broadcast: Audio from ${audioData.deviceId} sent to ${broadcastCount} client(s)`);
        }
      } catch (error) {
        console.error("Error processing Redis message:", error);
      }
    });
    
    console.log(`Subscribed to Redis channel: ${AUDIO_CHANNEL}`);
    console.log("Note: Using direct broadcast fallback (Redis stub mode)");
  } catch (error) {
    console.error("Failed to setup Redis subscription:", error);
    // Continue without Redis - will use direct broadcast as fallback
  }
}

// Initialize Redis subscription
setupRedisSubscription();

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    
    // Check if this is a WebSocket upgrade request
    const upgradeHeader = req.headers.get("upgrade");
    if (upgradeHeader === "websocket") {
      // Extract token from query string or headers
      const token = url.searchParams.get("token") || req.headers.get("authorization")?.replace("Bearer ", "");
      
      if (!token) {
        return new Response("WebSocket connection requires authentication token", { status: 401 });
      }

      // Verify token before upgrading
      const user = await verifyToken(token);
      if (!user) {
        return new Response("Invalid or expired token", { status: 401 });
      }

      // Handle WebSocket upgrade
      const upgraded = server.upgrade(req, {
        data: {
          userId: user.userId,
          username: user.username,
          roomId: user.roomId,
          token,
        } as any,
      });
      
      if (upgraded) {
        console.log(`WebSocket upgrade request from ${user.username} (room: ${user.roomId})`);
        return; // Return undefined to indicate we handled the upgrade
      } else {
        console.error("Failed to upgrade WebSocket connection");
        return new Response("WebSocket upgrade failed", { status: 426 });
      }
    }
    
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }
    
    // Handle API routes
    const pathname = url.pathname;
    
    // Auth routes
    if (pathname === "/api/auth/signup" && req.method === "POST") {
      return authRoutes.signup(req);
    }
    if (pathname === "/api/auth/login" && req.method === "POST") {
      return authRoutes.login(req);
    }
    if (pathname === "/api/auth/logout" && req.method === "POST") {
      return authRoutes.logout(req);
    }
    if (pathname === "/api/auth/me" && req.method === "GET") {
      return authRoutes.getMe(req);
    }
    
    // Room routes
    const roomMembersMatch = pathname.match(/^\/api\/rooms\/([^\/]+)\/members$/);
    if (roomMembersMatch && req.method === "GET") {
      const roomId = roomMembersMatch[1];
      if (roomId) {
        return roomRoutes.getRoomMembers(req, roomId);
      }
    }
    if (pathname === "/api/rooms/join" && req.method === "POST") {
      return roomRoutes.joinRoom(req);
    }
    
    // Handle HTTP requests
    return new Response("Walkie Talkie Server is running!", {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    // Handle new WebSocket connection
    open(ws: any) {
      const { userId, username, roomId } = ws.data;
      console.log(`New WebSocket connection: ${username} (${userId}) in room ${roomId}`);
      
      // Store connection
      connectedClients.set(userId, ws);
      ws.userId = userId;
      ws.username = username;
      ws.roomId = roomId;
      
      // Add to room members set
      const userRoomId = roomId || ws.data.roomId;
      if (userRoomId) {
        if (!roomMembers.has(userRoomId)) {
          roomMembers.set(userRoomId, new Set());
        }
        roomMembers.get(userRoomId)!.add(userId);
      }
      
      // Send connection confirmation
      ws.send(JSON.stringify({
        type: "connected",
        userId,
        username,
        roomId,
      }));
    },
    
    // Handle incoming messages
    async message(ws: any, message: string | Buffer) {
      try {
        // Handle binary or text messages
        let data: any;
        
        if (typeof message === "string") {
          data = JSON.parse(message);
        } else {
          // Handle Buffer - convert to string
          const text = message.toString();
          data = JSON.parse(text);
        }
        
        // Handle different message types
        if (data.type === "audio:room" || data.type === "audio:user") {
          // Handle audio chunk - room broadcast or private message
          const { userId, username, roomId } = ws;
          
          if (!userId || !roomId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not authenticated",
            }));
            return;
          }
          
          try {
            const messageType = data.type;
            const targetUserId = data.type === "audio:user" ? data.targetUserId : null;
            
            // Prepare audio message
            const audioMessage = {
              type: messageType,
              fromUserId: userId,
              fromUsername: username,
              roomId,
              chunk: data.chunk,
              timestamp: data.timestamp || Date.now(),
            };
            
            const messageStr = JSON.stringify(audioMessage);
            let broadcastCount = 0;
            
            if (messageType === "audio:room") {
              // Broadcast to all members in the room
              const roomMemberSet = roomMembers.get(roomId);
              if (roomMemberSet) {
                roomMemberSet.forEach((memberUserId) => {
                  if (memberUserId !== userId) {
                    const clientWs = connectedClients.get(memberUserId);
                    if (clientWs && clientWs.readyState === 1) {
                      try {
                        clientWs.send(messageStr);
                        broadcastCount++;
                      } catch (error) {
                        console.error(`Error sending to user ${memberUserId}:`, error);
                        connectedClients.delete(memberUserId);
                        roomMemberSet.delete(memberUserId);
                      }
                    }
                  }
                });
              }
            } else if (messageType === "audio:user" && targetUserId) {
              // Send to specific user
              const clientWs = connectedClients.get(targetUserId);
              if (clientWs && clientWs.readyState === 1) {
                // Verify target user is in the same room
                const targetRoomMemberSet = roomMembers.get(roomId);
                if (targetRoomMemberSet && targetRoomMemberSet.has(targetUserId)) {
                  try {
                    clientWs.send(messageStr);
                    broadcastCount = 1;
                  } catch (error) {
                    console.error(`Error sending to user ${targetUserId}:`, error);
                    connectedClients.delete(targetUserId);
                    targetRoomMemberSet.delete(targetUserId);
                  }
                } else {
                  ws.send(JSON.stringify({
                    type: "error",
                    message: "Target user is not in this room",
                  }));
                  return;
                }
              } else {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Target user is not online",
                }));
                return;
              }
            }
            
            // Publish to Redis for potential multi-server support
            await handleAudioChunk(
              {
                type: "audio",
                deviceId: userId,
                chunk: data.chunk,
                timestamp: data.timestamp || Date.now(),
              } as AudioChunkMessage,
              userId
            );
            
            if (broadcastCount > 0) {
              console.log(
                `Audio ${messageType} from ${username} (${userId}) sent to ${broadcastCount} recipient(s)`
              );
            }
          } catch (error) {
            console.error("Error processing audio chunk:", error);
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to process audio chunk",
            }));
          }
        } else if (data.type === "ping") {
          // Heartbeat
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        try {
          ws.send(JSON.stringify({
            type: "error",
            message: "Invalid message format",
          }));
        } catch (sendError) {
          console.error("Error sending error message:", sendError);
        }
      }
    },
    
    // Handle connection close
    async close(ws: any) {
      const { userId, username, roomId } = ws;
      if (userId) {
        connectedClients.delete(userId);
        
        // Remove from room members
        const roomMemberSet = roomMembers.get(roomId);
        if (roomMemberSet) {
          roomMemberSet.delete(userId);
          if (roomMemberSet.size === 0) {
            roomMembers.delete(roomId);
          }
        }
        
        console.log(`Client disconnected: ${username} (${userId}) from room ${roomId}`);
      } else {
        console.log("Client disconnected (no user ID)");
      }
    },
  },
});

console.log(`Walkie Talkie Server running on port ${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
