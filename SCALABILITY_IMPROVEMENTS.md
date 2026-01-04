# Scalability & Security Improvements

## ✅ Security Fixes Applied

### 1. **Room Membership Verification**
- ✅ Added database verification for WebSocket messages
- ✅ Users can only send messages to rooms they belong to
- ✅ Private messages verify target user is in the same room
- ✅ WebSocket connection validates membership before allowing connection

### 2. **Room Isolation**
- ✅ Users can only see members of rooms they belong to (already implemented in `getRoomMembers`)
- ✅ Database-level checks prevent unauthorized access
- ✅ WebSocket messages are validated against database membership

## ⚠️ Scalability Issues & Recommendations

### Current Limitations

1. **In-Memory State (Not Scalable)**
   - `connectedClients` Map - Won't work across multiple servers
   - `roomMembers` Map - Won't sync across instances
   - **Impact**: Can't horizontally scale

2. **Database Queries**
   - Every message verifies room membership (could be cached)
   - No connection pooling configuration
   - **Impact**: Database bottleneck at scale

3. **No Rate Limiting**
   - Users can spam audio messages
   - **Impact**: DoS vulnerability

4. **No Caching**
   - Room membership checked on every message
   - **Impact**: Unnecessary database load

### Recommended Improvements

#### 1. **Use Redis for Shared State** (High Priority)

Replace in-memory Maps with Redis:

```typescript
// Instead of:
const connectedClients = new Map<string, any>();
const roomMembers = new Map<string, Set<string>>();

// Use Redis:
// - Store WebSocket connections: SET "ws:user:{userId}" "{serverId}"
// - Store room members: SADD "room:{roomId}:members" "{userId}"
// - Use Redis pub/sub for cross-server messaging
```

**Benefits:**
- Horizontal scaling across multiple servers
- Shared state across instances
- Better performance with Redis pub/sub

#### 2. **Add Caching Layer**

Cache room membership with TTL:

```typescript
// Cache room membership for 30 seconds
const CACHE_TTL = 30;
const membershipCache = new Map<string, { isMember: boolean; expiresAt: number }>();

async function verifyRoomMembershipCached(userId: string, roomId: string): Promise<boolean> {
  const cacheKey = `${userId}:${roomId}`;
  const cached = membershipCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isMember;
  }
  
  const isMember = await verifyRoomMembership(userId, roomId);
  membershipCache.set(cacheKey, {
    isMember,
    expiresAt: Date.now() + CACHE_TTL * 1000,
  });
  
  return isMember;
}
```

#### 3. **Add Rate Limiting**

Prevent message spam:

```typescript
import { RateLimiter } from "./middleware/rateLimiter.js";

const audioRateLimiter = new RateLimiter({
  windowMs: 1000, // 1 second
  max: 10, // 10 messages per second
});

// In message handler:
if (!audioRateLimiter.check(userId)) {
  ws.send(JSON.stringify({
    type: "error",
    message: "Rate limit exceeded",
  }));
  return;
}
```

#### 4. **Database Connection Pooling**

Configure Prisma connection pool:

```typescript
// In lib/prisma.ts
export const prisma = new PrismaClient({
  adapter: databaseUrl ? { url: databaseUrl } : undefined,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  // Add connection pool settings
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});
```

#### 5. **Add Monitoring & Metrics**

Track performance:

```typescript
// Track metrics
const metrics = {
  messagesPerSecond: 0,
  activeConnections: 0,
  activeRooms: 0,
  databaseQueries: 0,
};

// Expose metrics endpoint
if (pathname === "/metrics" && req.method === "GET") {
  return new Response(JSON.stringify(metrics), {
    headers: { "Content-Type": "application/json" },
  });
}
```

#### 6. **Optimize Database Queries**

Add database indexes (already in schema):
- ✅ `userId_roomId` unique index
- ✅ `roomId` index
- ✅ `isActive` index

Consider:
- Composite index on `(roomId, isActive)` for faster queries
- Materialized view for active room members

#### 7. **WebSocket Connection Limits**

Prevent resource exhaustion:

```typescript
const MAX_CONNECTIONS_PER_USER = 3;
const MAX_CONNECTIONS_TOTAL = 10000;

// In WebSocket open handler:
const userConnections = Array.from(connectedClients.values())
  .filter(ws => ws.userId === userId).length;

if (userConnections >= MAX_CONNECTIONS_PER_USER) {
  ws.close(1008, "Too many connections");
  return;
}
```

## Current Architecture Assessment

### ✅ What's Good:
- Database-backed authentication
- Room membership verification
- Proper error handling
- JWT-based security

### ⚠️ What Needs Improvement:
- In-memory state (blocks horizontal scaling)
- No rate limiting
- No caching
- No monitoring

## Migration Path to Scale

1. **Phase 1: Add Caching** (Quick Win)
   - Implement membership cache
   - Reduce database queries by 80%+

2. **Phase 2: Add Rate Limiting** (Security)
   - Prevent abuse
   - Protect server resources

3. **Phase 3: Migrate to Redis** (Scalability)
   - Replace in-memory Maps
   - Enable horizontal scaling
   - Use Redis pub/sub for messaging

4. **Phase 4: Add Monitoring** (Observability)
   - Track metrics
   - Set up alerts
   - Performance monitoring

## Estimated Capacity (Current Setup)

- **Single Server**: ~1,000-5,000 concurrent connections
- **With Redis**: Unlimited (horizontal scaling)
- **Database**: PostgreSQL can handle 10,000+ concurrent connections with proper pooling

## Security Checklist

- ✅ Users can only see members of their rooms
- ✅ WebSocket messages verify room membership
- ✅ Private messages verify target is in same room
- ✅ JWT authentication required
- ⚠️ Add rate limiting (recommended)
- ⚠️ Add input validation (recommended)
- ⚠️ Add CORS restrictions (recommended)

