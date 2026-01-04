# Render Deployment Guide

## Fixed Issues

### ✅ Prisma Client Initialization
- Removed incorrect `adapter` property from PrismaClient constructor
- Prisma Client automatically reads `DATABASE_URL` from environment variables
- Added `postinstall` script to generate Prisma Client after install

## Render Configuration

### Environment Variables

Set these in Render dashboard:

1. **DATABASE_URL**
   - Format: `postgresql://user:password@host:port/database?schema=public`
   - Get from your PostgreSQL database service in Render

2. **JWT_SECRET**
   - Generate a strong secret: `openssl rand -base64 32`
   - Example: `your-super-secret-jwt-key-change-this`

3. **JWT_EXPIRES_IN** (optional)
   - Default: `7d`
   - Examples: `1d`, `7d`, `30d`

4. **PORT** (optional)
   - Render sets this automatically
   - Default: `4000`

5. **REDIS_URL** (optional)
   - Only needed if using real Redis
   - Format: `redis://host:port` or `rediss://host:port` for SSL

### Build & Start Commands

**Build Command:** (leave empty or use)
```bash
bun install
```

**Start Command:**
```bash
bun run start
```

This will:
1. Generate Prisma Client (`bun x prisma generate`)
2. Start the server (`bun run index.ts`)

### Database Setup

1. **Create PostgreSQL Database in Render**
   - Go to Render dashboard
   - Create new PostgreSQL database
   - Copy the Internal Database URL

2. **Run Migrations**
   ```bash
   # Locally or via Render shell
   cd backend
   bun x prisma migrate deploy
   ```

   Or set up a one-time migration script:
   ```bash
   bun x prisma migrate deploy
   ```

3. **Set DATABASE_URL**
   - In Render dashboard → Environment
   - Add `DATABASE_URL` with your PostgreSQL connection string

## Deployment Checklist

- [ ] PostgreSQL database created in Render
- [ ] DATABASE_URL set in environment variables
- [ ] JWT_SECRET set (strong random string)
- [ ] JWT_EXPIRES_IN set (optional)
- [ ] Database migrations run (`prisma migrate deploy`)
- [ ] Build command: `bun install` (or empty)
- [ ] Start command: `bun run start`
- [ ] Health check endpoint: `/` (returns "Walkie Talkie Server is running!")

## Troubleshooting

### Error: "Cannot find module '.prisma/client/default'"
**Solution:** Added `postinstall` script to generate Prisma Client automatically

### Error: "PrismaClientInitializationError: Driver Adapter undefined"
**Solution:** Fixed Prisma Client initialization - removed incorrect adapter property

### Error: "Connection refused" or database errors
**Solution:** 
- Verify DATABASE_URL is correct
- Check PostgreSQL database is running
- Ensure migrations are run: `bun x prisma migrate deploy`

### Error: "Port already in use"
**Solution:** Render sets PORT automatically, don't override it

## Health Check

After deployment, test:
```bash
curl https://your-app.onrender.com/
# Should return: "Walkie Talkie Server is running!"
```

## WebSocket Connection

WebSocket URL format:
```
wss://your-app.onrender.com?token=YOUR_JWT_TOKEN
```

The mobile app should connect automatically with the token from authentication.

