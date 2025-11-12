import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X, ChevronLeft } from 'lucide-react';
import { useAccount } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { TOKENS } from '../hooks/useDEX';
import TokenLogo from './TokenLogo';

interface SwapEvent {
  tx_hash: string;
  pool_address: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  timestamp: string;
}

export default function ActivityTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [swapEvents, setSwapEvents] = useState<SwapEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const isArcTestnet = chainId === 5042002;

  // Supabase configuration
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  // Fetch swap events for the user
  useEffect(() => {
    if (!isOpen || !isConnected || !isArcTestnet || !address || !supabaseUrl || !supabaseKey) {
      setSwapEvents([]);
      return;
    }

    const fetchSwapEvents = async () => {
      setIsLoading(true);
      try {
        // Query swap events directly by sender_address - no RPC calls needed!
        const addressLower = address.toLowerCase();
        const response = await fetch(
          `${supabaseUrl}/rest/v1/swap_events?sender_address=eq.${addressLower}&select=tx_hash,pool_address,token_in,token_out,amount_in,amount_out,timestamp&order=timestamp.desc&limit=1000`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );

        if (response.ok) {
          const events = await response.json();
          setSwapEvents(events);
        }
      } catch (error) {
        console.error('Error fetching swap events:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSwapEvents();
  }, [isOpen, isConnected, isArcTestnet, address, supabaseUrl, supabaseKey]);

  // Get token symbol from address
  const getTokenSymbol = (address: string): string => {
    const tokenEntry = Object.entries(TOKENS).find(
      ([_, info]) => info.address.toLowerCase() === address.toLowerCase()
    );
    return tokenEntry ? tokenEntry[0] : address.slice(0, 6) + '...';
  };

  // Get token decimals from address
  const getTokenDecimals = (address: string): number => {
    const tokenEntry = Object.entries(TOKENS).find(
      ([_, info]) => info.address.toLowerCase() === address.toLowerCase()
    );
    return tokenEntry ? tokenEntry[1].decimals : 18;
  };

  // Format amount
  const formatAmount = (amount: string, decimals: number): string => {
    try {
      const formatted = formatUnits(BigInt(amount), decimals);
      const num = parseFloat(formatted);
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
      if (num < 0.0001) return num.toExponential(2);
      return num.toFixed(4);
    } catch {
      return '0';
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isConnected || !isArcTestnet) {
    return null;
  }

  return (
    <>
      {/* Floating Activity Button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-40 bg-orange-500 text-white rounded-full p-3 shadow-lg hover:bg-orange-600 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="View activity"
      >
        <Activity className="w-6 h-6" />
      </motion.button>

      {/* Activity Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            />

            {/* Slide-out Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-orange-600" />
                    <h2 className="text-lg font-bold text-gray-900">Swap History</h2>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Loading swap history...</p>
                    </div>
                  </div>
                ) : swapEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 p-4">
                    <Activity className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-sm text-gray-500 text-center">
                      No swap activity found
                    </p>
                    <p className="text-xs text-gray-400 text-center mt-1">
                      Your recent swaps will appear here
                    </p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {swapEvents.map((event, index) => {
                      const tokenInSymbol = getTokenSymbol(event.token_in);
                      const tokenOutSymbol = getTokenSymbol(event.token_out);
                      const tokenInDecimals = getTokenDecimals(event.token_in);
                      const tokenOutDecimals = getTokenDecimals(event.token_out);
                      const amountInFormatted = formatAmount(event.amount_in, tokenInDecimals);
                      const amountOutFormatted = formatAmount(event.amount_out, tokenOutDecimals);

                      return (
                        <motion.div
                          key={`${event.tx_hash}-${index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-gradient-to-br from-orange-50 to-white rounded-lg p-2.5 border border-orange-100 hover:border-orange-200 transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-1.5">
                                <div className="w-6 h-6 rounded-full bg-white border border-orange-200 flex items-center justify-center flex-shrink-0">
                                  <TokenLogo token={tokenInSymbol} size={18} />
                                </div>
                                <div className="w-6 h-6 rounded-full bg-white border border-orange-200 flex items-center justify-center flex-shrink-0">
                                  <TokenLogo token={tokenOutSymbol} size={18} />
                                </div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">
                                  {tokenInSymbol} → {tokenOutSymbol}
                                </p>
                                <p className="text-xs text-gray-500">{formatTime(event.timestamp)}</p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white rounded-md p-1.5 border border-gray-100">
                              <p className="text-xs text-gray-500 mb-0.5">In</p>
                              <p className="text-xs font-bold text-gray-900 leading-tight">{amountInFormatted}</p>
                              <p className="text-xs text-gray-400 truncate">{tokenInSymbol}</p>
                            </div>
                            <div className="bg-white rounded-md p-1.5 border border-gray-100">
                              <p className="text-xs text-gray-500 mb-0.5">Out</p>
                              <p className="text-xs font-bold text-orange-600 leading-tight">{amountOutFormatted}</p>
                              <p className="text-xs text-gray-400 truncate">{tokenOutSymbol}</p>
                            </div>
                          </div>

                          <a
                            href={`https://explorer.arc.network/tx/${event.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 w-fit"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View on Explorer
                          </a>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

