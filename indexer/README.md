# DEX Indexer

This indexer listens to blockchain events from the DEX Factory and pools, then stores swap data in Supabase.

## Railway Setup

**CRITICAL SETUP STEPS**:

1. **Create a NEW service** in Railway (don't reuse the frontend service)
2. **Connect to the same GitHub repo**
3. **Set Root Directory** to `/indexer` in Railway service Settings → Source
4. **Set Service Type** to "Worker" (NOT "Web Service") - this is critical!
5. **Add Environment Variables** in Railway Variables tab:
   - `WSS_URL` = `wss://rpc.testnet.arc.network` (or one of the alternatives)
   - `SUPABASE_URL` = Your Supabase project URL
   - `SUPABASE_ANON_KEY` = Your Supabase anon key

## Why Railway Shows Caddy Instead of Indexer

If you see Caddy web server logs, it means:
- Railway detected this as a "Web Service" instead of a "Worker"
- You need to explicitly set the service type to "Worker" in Railway settings
- OR you're looking at the wrong service's logs (check you're viewing the indexer service)

## Local Development

```bash
cd indexer
npm install
npm start
```

## Environment Variables

- `WSS_URL` - WebSocket RPC URL (default: `wss://rpc.testnet.arc.network`)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

## What the Indexer Does

The indexer will:
- Poll every 10 seconds
- Track all pools from the factory
- Listen for Swap events
- Store raw swap events in Supabase
- Update pool reserves from on-chain data (ERC20 balances)

## Expected Railway Logs

When the indexer starts correctly, you should see:

```
🚀 Initializing DEX Indexer...
📍 Working directory: /app
📦 Node version: v20.x.x

=== Indexer Configuration ===
WSS_URL: SET
SUPABASE_URL: SET (https://...)
SUPABASE_KEY: SET (eyJ...)
Supabase client: ✓ INITIALIZED
============================

Starting indexer polling loop...
Found X pools
...
```

**If you see Caddy logs instead**, Railway is treating this as a web service. Go to Service Settings → General → and change the service type to "Worker".
