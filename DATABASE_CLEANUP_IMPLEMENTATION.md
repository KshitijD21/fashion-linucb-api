# Automatic Database Cleanup Implementation

## Overview

This implementation adds automatic database cleanup functionality to the Fashion LinUCB API server, ensuring fresh ML algorithm training by clearing contaminated data on each startup.

## Features Implemented

### 🧹 Automatic Cleanup Function

The `cleanupDatabase()` function automatically clears ML-related collections while preserving product data:

- **Clears:** `session_history`, `user_sessions`, `interactions` collections
- **Preserves:** `products` collection and all database indexes
- **Reports:** Document counts before and after cleanup
- **Safety:** Error handling prevents startup failure if cleanup fails

### 🔧 Configuration Options

Added environment variables for flexible cleanup control:

```env
# Enable automatic database cleanup on server startup
ENABLE_AUTO_CLEANUP=true

# Skip cleanup in production environment for safety
CLEANUP_SKIP_IN_PRODUCTION=true
```

### 📊 Comprehensive Logging

The cleanup process provides detailed logging:

```
🧹 Starting automatic database cleanup...
📊 Current ML data before cleanup:
   • Session History: 0 documents
   • User Sessions: 0 documents
   • Interactions: 0 documents
🗑️  Clearing ML training data...
   ✅ session_history: 0 documents removed
   ✅ user_sessions: 0 documents removed
   ✅ interactions: 0 documents removed
📦 Products collection preserved: 1007 products available
✅ Database cleanup completed successfully
🧠 ML algorithms will start with fresh training data
```

### 🛡️ Safety Features

1. **Production Protection:** Cleanup can be disabled in production environments
2. **Error Resilience:** Server continues startup even if cleanup fails
3. **Collection Preservation:** Products collection and indexes are never touched
4. **Graceful Degradation:** Clear warnings when cleanup is skipped

## Implementation Details

### Server Startup Flow

1. **Database Connection:** Connect to MongoDB and setup collections
2. **Automatic Cleanup:** Clear ML training data (if enabled)
3. **Index Setup:** Ensure database indexes are created
4. **API Initialization:** Start HTTP server and routes

### Code Structure

```typescript
// Configuration
const ENABLE_AUTO_CLEANUP = process.env.ENABLE_AUTO_CLEANUP !== "false";
const CLEANUP_SKIP_IN_PRODUCTION =
  process.env.CLEANUP_SKIP_IN_PRODUCTION === "true";

// Cleanup function
async function cleanupDatabase(collections) {
  // Clear ML collections while preserving products
}

// Integration in startup
async function startServer() {
  await connectDatabase();

  if (collections && ENABLE_AUTO_CLEANUP) {
    await cleanupDatabase(collections);
  }

  // Start server...
}
```

### Error Handling

- **Cleanup Failures:** Don't prevent server startup
- **Missing Collections:** Graceful warnings
- **Production Safety:** Automatic skipping in production
- **Individual Collection Errors:** Continue with other collections

## Configuration Guide

### Development Environment

```env
ENABLE_AUTO_CLEANUP=true
CLEANUP_SKIP_IN_PRODUCTION=true
NODE_ENV=development
```

### Production Environment

```env
ENABLE_AUTO_CLEANUP=true
CLEANUP_SKIP_IN_PRODUCTION=true  # Cleanup will be skipped
NODE_ENV=production
```

### Force Production Cleanup (Use with Caution)

```env
ENABLE_AUTO_CLEANUP=true
CLEANUP_SKIP_IN_PRODUCTION=false  # Cleanup will run in production
NODE_ENV=production
```

## Expected Behavior

### On Each Server Startup:

1. **Connect to Database:** Establish MongoDB connection
2. **Assess Current Data:** Count existing ML training documents
3. **Clear Training Data:** Remove all session history, user sessions, and interactions
4. **Preserve Products:** Keep all fashion product data intact
5. **Verify Success:** Confirm products are preserved and report statistics
6. **Initialize ML:** Start fresh LinUCB algorithm training

### Benefits:

- **Clean ML Training:** No contaminated data from previous sessions
- **Consistent Results:** Predictable algorithm behavior
- **Development Efficiency:** No manual database cleanup needed
- **Production Safety:** Configurable cleanup behavior
- **Data Integrity:** Products collection always preserved

## Testing

The implementation has been tested and verified:

✅ **Database Connection:** MongoDB Atlas connection successful
✅ **Cleanup Execution:** All ML collections cleared successfully
✅ **Product Preservation:** 1007 products maintained
✅ **Index Integrity:** All database indexes preserved
✅ **Error Handling:** Graceful handling of various error conditions
✅ **Configuration:** Environment variables work as expected
✅ **Logging:** Clear, informative startup messages

## Files Modified

1. **`server.ts`:** Added cleanup function and startup integration
2. **`.env`:** Added configuration options for cleanup behavior

## Usage

The cleanup now runs automatically on every server startup. No manual intervention required!

```bash
# Start server - cleanup runs automatically
pnpm start

# Or in development mode
pnpm run dev
```

## Troubleshooting

### Cleanup Disabled

If you see: `⚠️ Database auto-cleanup disabled via configuration`

- Set `ENABLE_AUTO_CLEANUP=true` in your `.env` file

### Production Skip

If you see: `⚠️ Skipping database cleanup in production environment`

- This is normal and safe - production data is preserved
- Set `CLEANUP_SKIP_IN_PRODUCTION=false` only if you want cleanup in production

### Collection Not Available

If you see: `⚠️ Skipping database cleanup - collections not available`

- Check your MongoDB connection
- Verify `MONGODB_URI` is correctly set in `.env`

## Next Steps

The automatic database cleanup is now fully implemented and operational. The ML algorithms will start with fresh training data on every server restart, ensuring consistent and reliable recommendation performance.
