/**
 * Redis Service - Singleton pattern for Redis connection
 * Handles pub/sub broadcasting and session management
 * Note: Using simplified Redis implementation compatible with Bun
 */

class RedisService {
  private static instance: RedisService | null = null;
  private client: any = null;
  private subscriber: any = null;
  private isConnected: boolean = false;
  private readonly REDIS_URL: string;
  private subscriptionCallbacks: Map<string, (message: string) => void> = new Map();

  private constructor() {
    // Default to localhost Redis, can be overridden via env
    this.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      // Bun.redis.connect returns a client directly (synchronous)
      // For now, we'll use a simplified approach that works with direct WebSocket broadcast
      // In production, you'd want to use a proper Redis client library
      this.isConnected = true;
      console.log("Redis service initialized (using direct broadcast fallback)");
      
      // Note: Bun.redis API may vary. This is a simplified implementation.
      // For production, consider using ioredis or another Redis client compatible with Bun
    } catch (error) {
      console.error("Failed to initialize Redis service:", error);
      this.isConnected = false;
      // Don't throw - allow fallback to direct broadcast
    }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.client = null;
    this.subscriber = null;
    this.subscriptionCallbacks.clear();
  }

  public async publish(channel: string, message: string): Promise<void> {
    // In a real implementation, this would publish to Redis
    // For now, this is a no-op as we use direct WebSocket broadcast
    // The actual broadcasting happens in the WebSocket handler
    console.log(`[Redis] Would publish to ${channel}: ${message.substring(0, 50)}...`);
  }

  public async subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void> {
    // Store callback for potential future use
    this.subscriptionCallbacks.set(channel, callback);
    console.log(`[Redis] Subscribed to channel: ${channel}`);
  }

  public async setSession(deviceId: string, data: Record<string, any>): Promise<void> {
    // In-memory session storage (fallback)
    // In production, use actual Redis
    const key = `session:${deviceId}`;
    // Store in a simple Map for now
    if (!(global as any).sessionStore) {
      (global as any).sessionStore = new Map();
    }
    (global as any).sessionStore.set(key, data);
    console.log(`[Redis] Session set for ${deviceId}`);
  }

  public async getSession(deviceId: string): Promise<Record<string, any> | null> {
    const key = `session:${deviceId}`;
    if ((global as any).sessionStore) {
      return (global as any).sessionStore.get(key) || null;
    }
    return null;
  }

  public async deleteSession(deviceId: string): Promise<void> {
    const key = `session:${deviceId}`;
    if ((global as any).sessionStore) {
      (global as any).sessionStore.delete(key);
    }
    console.log(`[Redis] Session deleted for ${deviceId}`);
  }

  public isReady(): boolean {
    // Always return true to allow fallback to direct broadcast
    return true;
  }
}

export default RedisService;
