/**
 * DEX Indexer for Railway
 * 
 * This indexer listens to blockchain events and stores swap data in Supabase:
 * - Listens to PoolCreated events from the Factory
 * - Listens to Swap events from all pools
 * - Calculates volume and fees
 * - Stores daily metrics in Supabase
 * 
 * Run with: node index.js
 */

// Load environment variables from .env file
require('dotenv').config();

const { createPublicClient, webSocket, http, parseAbiItem } = require('viem');
const { createClient } = require('@supabase/supabase-js');

// DEX Configuration
const DEX_CONFIG = {
  FACTORY_ADDRESS: "0x34A0b64a88BBd4Bf6Acba8a0Ff8F27c8aDD67E9C",
  CHAIN_ID: 5042002,
  EXPLORER_URL: "https://testnet.arcscan.app",
};

// Factory ABI (minimal - only functions we need)
const FACTORY_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'allPools',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allPoolsLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Pool ABI (minimal - only functions we need)
const POOL_ABI = [
  {
    inputs: [],
    name: 'tokenA',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tokenB',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reserveA',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reserveB',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint256', name: '_reserveA', type: 'uint256' },
      { internalType: 'uint256', name: '_reserveB', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

// ERC20 ABI for getting token symbols, decimals, and balances
const ERC20_ABI = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Known tokens (for USDC address)
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'; // Arc Testnet USDC
const KNOWN_TOKENS = {
  '0x3600000000000000000000000000000000000000': { symbol: 'USDC', decimals: 6 },
  '0x49cd69442dB073E7b94B0124e316AB7C68b95988': { symbol: 'SRAC', decimals: 18 },
  '0x6E63e2cABECCe5c3A1c37b79A958a9542076A1e3': { symbol: 'RACS', decimals: 18 },
  '0x63F856fBAB3535174bFaFD6EFd720C634d6FD458': { symbol: 'SACS', decimals: 18 },
  // Old tokens (for backwards compatibility)
  
};

// Environment variables
const WSS_URL = process.env.WSS_URL || 'wss://rpc.testnet.arc.network';
const HTTP_RPC_URL = process.env.HTTP_RPC_URL || 'https://arc-testnet.g.alchemy.com/v2/Gwa0xpQWE3hHxyKllpxbGQmkRLNhV51N';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

// Arc Testnet chain config
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://testnet.arcscan.app' },
  },
};

// Initialize clients - HTTP for reads (fresh data), WebSocket for events
const httpClient = createPublicClient({
  chain: arcTestnet,
  transport: http(HTTP_RPC_URL, {
    batch: false, // No batching - ensure fresh reads
  }),
  cacheTime: 0, // No caching - always fetch fresh data
});

// WebSocket client for event listening (swap events, pool creation)
const wssClient = createPublicClient({
  chain: arcTestnet,
  transport: webSocket(WSS_URL),
});

const supabase = SUPABASE_URL && SUPABASE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Log Supabase configuration status on startup
console.log('\n=== Indexer Configuration ===');
console.log('WSS_URL:', WSS_URL ? 'SET' : 'MISSING');
console.log('SUPABASE_URL:', SUPABASE_URL ? 'SET (' + SUPABASE_URL.substring(0, 30) + '...)' : 'MISSING');
console.log('SUPABASE_KEY:', SUPABASE_KEY ? 'SET (' + SUPABASE_KEY.substring(0, 20) + '...)' : 'MISSING');
console.log('Supabase client:', supabase ? '✓ INITIALIZED' : '✗ NOT INITIALIZED');
console.log('============================\n');

// Track known pools
const knownPools = new Set();
let lastProcessedBlock = null;

/**
 * Fetch all pools from factory
 */
async function fetchAllPools() {
  try {
    const poolCount = await httpClient.readContract({
      address: DEX_CONFIG.FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'allPoolsLength',
    });

    const pools = [];
    for (let i = 0; i < Number(poolCount); i++) {
      try {
        const poolAddress = await httpClient.readContract({
          address: DEX_CONFIG.FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'allPools',
          args: [BigInt(i)],
        });

        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          pools.push(poolAddress);
          knownPools.add(poolAddress.toLowerCase());
        }
      } catch (error) {
        console.error(`Error fetching pool ${i}:`, error);
      }
    }

    return pools;
  } catch (error) {
    console.error('Error fetching pools:', error);
    return [];
  }
}

/**
 * Process Swap events from a pool
 */
async function processSwapEvents(poolAddress, fromBlock, toBlock) {
  try {
    const swapEventAbi = parseAbiItem(
      'event Swap(address indexed sender, uint256 amountAIn, uint256 amountBIn, uint256 amountAOut, uint256 amountBOut, address indexed to)'
    );

    const logs = await wssClient.getLogs({
      address: poolAddress,
      event: swapEventAbi,
      fromBlock,
      toBlock,
    });

    // Get pool token addresses (use HTTP for fresh reads)
    const [tokenA, tokenB] = await Promise.all([
      httpClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'tokenA',
      }),
      httpClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'tokenB',
      }),
    ]);

    const events = [];

    for (const log of logs) {
      const args = log.args;
      if (!args) continue;

      const amountAIn = args.amountAIn || BigInt(0);
      const amountBIn = args.amountBIn || BigInt(0);
      const amountAOut = args.amountAOut || BigInt(0);
      const amountBOut = args.amountBOut || BigInt(0);

      // Determine swap direction
      let tokenIn, tokenOut, amountIn, amountOut;

      if (amountAIn > 0) {
        tokenIn = tokenA;
        tokenOut = tokenB;
        amountIn = amountAIn;
        amountOut = amountBOut;
      } else if (amountBIn > 0) {
        tokenIn = tokenB;
        tokenOut = tokenA;
        amountIn = amountBIn;
        amountOut = amountAOut;
      } else {
        continue;
      }

      // Get block timestamp
      const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
      const timestamp = Number(block.timestamp) * 1000;

      // Get sender address from event (first indexed parameter)
      const sender = args.sender || null;

      events.push({
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        timestamp,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        sender: sender ? sender.toLowerCase() : null,
      });
    }

    return events;
  } catch (error) {
    console.error(`Error processing swap events for pool ${poolAddress}:`, error);
    return [];
  }
}

/**
 * Get token symbol and decimals
 */
async function getTokenInfo(tokenAddress) {
  const tokenLower = tokenAddress.toLowerCase();
  
  // Check known tokens first
  for (const [addr, info] of Object.entries(KNOWN_TOKENS)) {
    if (addr.toLowerCase() === tokenLower) {
      return info;
    }
  }

  // Fetch from contract
  try {
    const [symbol, decimals] = await Promise.all([
      httpClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }).catch(() => null),
      httpClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => 18),
    ]);

    return {
      symbol: symbol || tokenAddress.slice(0, 6) + '...',
      decimals: Number(decimals) || 18,
    };
  } catch (error) {
    return {
      symbol: tokenAddress.slice(0, 6) + '...',
      decimals: 18,
    };
  }
}

/**
 * Get token price in USD (simplified - use USDC as base)
 */
async function getTokenPriceInUSD(tokenAddress, pools) {
  // USDC is always $1 (Arc uses USDC as native currency)
  if (tokenAddress.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    return 1;
  }

  // Try to find USDC pair
  for (const poolAddress of pools) {
    try {
      const [tokenA, tokenB] = await Promise.all([
        httpClient.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'tokenA',
        }),
        httpClient.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'tokenB',
        }),
      ]);

      const tokenALower = tokenA.toLowerCase();
      const tokenBLower = tokenB.toLowerCase();
      const tokenAddrLower = tokenAddress.toLowerCase();

      if (tokenALower === USDC_ADDRESS.toLowerCase() && tokenBLower === tokenAddrLower) {
        // Get reserves to calculate price
        const [reserveA, reserveB] = await Promise.all([
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'reserveA',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'reserveB',
          }),
        ]);

        // Get token decimals
        const tokenInfo = await getTokenInfo(tokenB);
        const usdcDecimals = 6;
        
        // Price = USDC reserve / Token reserve
        const reserveAFormatted = Number(reserveA) / (10 ** usdcDecimals);
        const reserveBFormatted = Number(reserveB) / (10 ** tokenInfo.decimals);
        if (reserveBFormatted > 0) {
          return reserveAFormatted / reserveBFormatted;
        }
      } else if (tokenBLower === USDC_ADDRESS.toLowerCase() && tokenALower === tokenAddrLower) {
        // USDC is tokenB
        const [reserveA, reserveB] = await Promise.all([
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'reserveA',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'reserveB',
          }),
        ]);

        const tokenInfo = await getTokenInfo(tokenA);
        const usdcDecimals = 6;
        
        const reserveAFormatted = Number(reserveA) / (10 ** tokenInfo.decimals);
        const reserveBFormatted = Number(reserveB) / (10 ** usdcDecimals);
        if (reserveAFormatted > 0) {
          return reserveBFormatted / reserveAFormatted;
        }
      }
    } catch (error) {
      // Continue to next pool
      continue;
    }
  }

  return 0; // Unknown price
}

/**
 * Store swap events in Supabase
 * Only stores raw swap events - volume/fees calculated on frontend from USDC amounts
 */
async function storeSwapEvents(events, pools) {
  if (!supabase || events.length === 0) return;

  try {
    for (const event of events) {
      // Store individual swap event (raw data)
      await supabase.from('swap_events').upsert({
        tx_hash: event.txHash,
        pool_address: event.poolAddress.toLowerCase(),
        token_in: event.tokenIn.toLowerCase(),
        token_out: event.tokenOut.toLowerCase(),
        amount_in: event.amountIn.toString(),
        amount_out: event.amountOut.toString(),
        block_number: event.blockNumber.toString(),
        timestamp: new Date(event.timestamp).toISOString(),
        sender_address: event.sender || null,
      }, {
        onConflict: 'tx_hash',
      });
    }

    console.log(`✓ Stored ${events.length} swap events`);
  } catch (error) {
    console.error('✗ Error storing swap events:', error);
  }
}

/**
 * Main indexing function
 */
async function index() {
  console.log('Starting DEX indexer...');

  // Fetch all pools
  const pools = await fetchAllPools();
  console.log(`Found ${pools.length} pools`);

  // Get current block (use HTTP for fresh data)
  const currentBlock = await httpClient.getBlockNumber();

  // Initialize last processed block if needed
  if (!lastProcessedBlock) {
    // Start from 10,000 blocks ago or deployment block
    lastProcessedBlock = currentBlock - BigInt(10000);
  }

  const fromBlock = lastProcessedBlock + BigInt(1);
  const toBlock = currentBlock;

  if (fromBlock > toBlock) {
    console.log('No new blocks to process, but updating pool reserves from on-chain anyway...');
    // Even if no new blocks, still update reserves (liquidity might have been added)
    // Continue to update pool data below
  }

  // Process swaps from all pools (only if there are new blocks)
  let allSwapEvents = [];
  
  if (fromBlock <= toBlock) {
    console.log(`Processing blocks ${fromBlock} to ${toBlock} for swap events`);
    for (const poolAddress of pools) {
      const events = await processSwapEvents(poolAddress, fromBlock, toBlock);
      allSwapEvents.push(...events);
    }
  }

  // Also listen for new PoolCreated events (only if there are new blocks)
  if (fromBlock <= toBlock) {
    const poolCreatedAbi = parseAbiItem(
      'event PoolCreated(address indexed tokenA, address indexed tokenB, address pool, uint256)'
    );

    const poolCreatedLogs = await wssClient.getLogs({
      address: DEX_CONFIG.FACTORY_ADDRESS,
      event: poolCreatedAbi,
      fromBlock,
      toBlock,
    });

    // Add newly created pools
    for (const log of poolCreatedLogs) {
      const args = log.args;
      if (args?.pool) {
        const newPool = args.pool;
        if (!knownPools.has(newPool.toLowerCase())) {
          knownPools.add(newPool.toLowerCase());
          pools.push(newPool);
          console.log(`New pool created: ${newPool}`);
        }
      }
    }
  }
  
  // IMPORTANT: Always update last processed block, even if no new blocks
  // This ensures we continue polling correctly
  if (fromBlock <= toBlock) {
    lastProcessedBlock = toBlock;
  }

  // Store events in Supabase
  if (allSwapEvents.length > 0) {
    await storeSwapEvents(allSwapEvents, pools);
  }

  // ALWAYS update pool reserves from on-chain (even if no swaps happened)
  // This ensures reserves are always fresh when new liquidity is added
  // On-chain is the source of truth - we fetch fresh reserves every poll
  console.log('Updating pool reserves from on-chain (source of truth)...');
  await storePoolData(pools);
  console.log('Pool reserves updated from on-chain');

  console.log(`Indexed ${allSwapEvents.length} swap events`);
}

/**
 * Store price history snapshot for a pool
 * Only stores if it's been at least 1 minute since last snapshot (to avoid excessive writes)
 */
async function storePriceHistory(poolAddress, tokenA, tokenB, tokenAInfo, tokenBInfo, reserveA, reserveB) {
  if (!supabase) return;

  try {
    // Calculate prices
    const reserveAFormatted = Number(reserveA) / (10 ** tokenAInfo.decimals);
    const reserveBFormatted = Number(reserveB) / (10 ** tokenBInfo.decimals);

    // Price of tokenA in terms of tokenB (how many tokenB per tokenA)
    const priceAperB = reserveBFormatted / reserveAFormatted;
    // Price of tokenB in terms of tokenA (how many tokenA per tokenB)
    const priceBperA = reserveAFormatted / reserveBFormatted;

    // Get current timestamp
    const now = new Date();

    // Check last snapshot time for this pool (to throttle writes)
    const { data: lastSnapshot } = await supabase
      .from('price_history')
      .select('timestamp')
      .eq('pool_address', poolAddress.toLowerCase())
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    // Only store if last snapshot was more than 1 minute ago (or no previous snapshot)
    if (!lastSnapshot || (now - new Date(lastSnapshot.timestamp)) > 60000) {
      const { error } = await supabase.from('price_history').insert({
        pool_address: poolAddress.toLowerCase(),
        token_a: tokenA.toLowerCase(),
        token_b: tokenB.toLowerCase(),
        token_a_symbol: tokenAInfo.symbol,
        token_b_symbol: tokenBInfo.symbol,
        price_a_per_b: priceAperB,
        price_b_per_a: priceBperA,
        reserve_a: reserveA.toString(),
        reserve_b: reserveB.toString(),
        timestamp: now.toISOString(),
      });

      if (error && !error.message.includes('duplicate key')) {
        console.error(`Error storing price history for ${poolAddress}:`, error);
      }
      // Silent success - don't spam logs for every price snapshot
    }
  } catch (error) {
    // Silent fail - price history is not critical
    console.error(`Error in storePriceHistory for ${poolAddress}:`, error);
  }
}

/**
 * Fetch and store pool data in Supabase
 */
async function storePoolData(pools) {
  console.log(`storePoolData called with ${pools.length} pools, supabase:`, !!supabase);
  
  if (!supabase) {
    console.error('ERROR: Supabase client not initialized! Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    return;
  }
  
  if (pools.length === 0) {
    console.log('No pools to store');
    return;
  }

  console.log(`Starting to store ${pools.length} pools...`);

  try {
    for (const poolAddress of pools) {
      try {
        // Fetch FRESH reserves directly from on-chain (this is the source of truth)
        // Use HTTP client for reliable fresh reads (no blockNumber = "latest" automatically)
        // Get current block for logging only
        const currentBlock = await httpClient.getBlockNumber();
        console.log(`  Reading reserves for ${poolAddress} (current block: ${currentBlock.toString()})`);
        
        // Fetch tokens first (using HTTP for fresh data)
        const [tokenA, tokenB] = await Promise.all([
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'tokenA',
          }),
          httpClient.readContract({
            address: poolAddress,
            abi: POOL_ABI,
            functionName: 'tokenB',
          }),
        ]);
        
        // CRITICAL: Read ACTUAL token balances from ERC20 contracts, not stored reserves
        // This is the real on-chain truth - balances are always accurate!
        // Stored reserves might be stale if _update() wasn't called
        const [reserveA, reserveB] = await Promise.all([
          // Read Token A balance directly from ERC20 contract
          httpClient.readContract({
            address: tokenA,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [poolAddress], // Pool's balance of tokenA
          }),
          // Read Token B balance directly from ERC20 contract
          httpClient.readContract({
            address: tokenB,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [poolAddress], // Pool's balance of tokenB
          }),
        ]);
        
        // Log the raw on-chain reserves (actual token balances) for verification
        console.log(`  Pool ${poolAddress}: reserveA=${reserveA.toString()}, reserveB=${reserveB.toString()}`);

        // Get token symbols and decimals
        const [tokenAInfo, tokenBInfo] = await Promise.all([
          getTokenInfo(tokenA),
          getTokenInfo(tokenB),
        ]);

        // Calculate TVL in USD
        const tokenAPrice = await getTokenPriceInUSD(tokenA, pools);
        const tokenBPrice = await getTokenPriceInUSD(tokenB, pools);

        const reserveAFormatted = Number(reserveA) / (10 ** tokenAInfo.decimals);
        const reserveBFormatted = Number(reserveB) / (10 ** tokenBInfo.decimals);

        const reserveAValue = reserveAFormatted * tokenAPrice;
        const reserveBValue = reserveBFormatted * tokenBPrice;
        const totalLiquidity = reserveAValue + reserveBValue;

        // Only store pools with liquidity
        if (reserveAFormatted > 0.000001 && reserveBFormatted > 0.000001) {
          const { error: upsertError } = await supabase.from('pools').upsert({
            pool_address: poolAddress.toLowerCase(),
            token_a: tokenA.toLowerCase(),
            token_b: tokenB.toLowerCase(),
            token_a_symbol: tokenAInfo.symbol,
            token_b_symbol: tokenBInfo.symbol,
            reserve_a: reserveA.toString(),
            reserve_b: reserveB.toString(),
            reserve_a_decimals: tokenAInfo.decimals,
            reserve_b_decimals: tokenBInfo.decimals,
            total_liquidity: totalLiquidity,
            last_updated: new Date().toISOString(),
          }, {
            onConflict: 'pool_address',
          });

          if (upsertError) {
            console.error(`✗ Error upserting pool ${poolAddress}:`, upsertError);
          } else {
            console.log(`✓ Updated pool ${poolAddress} (${tokenAInfo.symbol}/${tokenBInfo.symbol})`);
            console.log(`  Reserves: ${reserveAFormatted.toFixed(6)} ${tokenAInfo.symbol} / ${reserveBFormatted.toFixed(6)} ${tokenBInfo.symbol}`);
            console.log(`  TVL: $${totalLiquidity.toFixed(2)}`);
            
            // Store price history snapshot (for charts)
            await storePriceHistory(
              poolAddress,
              tokenA,
              tokenB,
              tokenAInfo,
              tokenBInfo,
              reserveA,
              reserveB
            );
          }
        } else {
          // Remove pool from Supabase if it has no liquidity
          const { error: deleteError } = await supabase.from('pools').delete().eq('pool_address', poolAddress.toLowerCase());
          if (deleteError) {
            console.error(`Error deleting pool ${poolAddress}:`, deleteError);
          } else {
            console.log(`✗ Removed pool ${poolAddress} (no liquidity)`);
          }
        }
      } catch (error) {
        console.error(`Error storing pool data for ${poolAddress}:`, error);
      }
    }

    // Verify storage
    const { data, error: verifyError } = await supabase.from('pools').select('pool_address').limit(10);
    if (verifyError) {
      console.error('✗ Error verifying pool storage:', verifyError);
    } else {
      console.log(`✓ Successfully updated pools in Supabase (${data?.length || 0} pools currently in database)`);
    }
  } catch (error) {
    console.error('✗ CRITICAL ERROR in storePoolData:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

/**
 * Run indexer in polling loop
 */
async function run() {
  console.log('Starting indexer polling loop...');
  
  while (true) {
    try {
      await index();
    } catch (error) {
      console.error('Indexing error:', error);
      // Log full error details but don't crash
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
    }

    // Wait 10 seconds before next poll (don't restart, just wait)
    console.log('Waiting 10 seconds before next poll...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, just log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log and continue
});

// Start the indexer (should run indefinitely)
console.log('🚀 Initializing DEX Indexer...');
console.log('📍 Working directory:', process.cwd());
console.log('📦 Node version:', process.version);
console.log('');

// Validate environment before starting
if (!WSS_URL) {
  console.error('❌ ERROR: WSS_URL environment variable is not set!');
  console.error('   Please set WSS_URL in Railway environment variables');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERROR: Supabase credentials not set!');
  console.error('   Please set SUPABASE_URL and SUPABASE_ANON_KEY in Railway environment variables');
  process.exit(1);
}

run().catch((error) => {
  console.error('❌ Fatal error in run loop:', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  // Even on fatal error, try to restart after 30 seconds
  setTimeout(() => {
    console.log('🔄 Attempting to restart indexer after error...');
    run().catch(console.error);
  }, 30000);
});

module.exports = { index, run };

