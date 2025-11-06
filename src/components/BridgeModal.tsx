import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowRight, Loader2, CheckCircle, AlertCircle, ExternalLink, ChevronDown, Clock, ArrowLeftRight } from 'lucide-react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import confetti from 'canvas-confetti';
import { useBridge, type BridgeToken, type BridgeStep, CHAIN_TOKENS, SEPOLIA_CHAIN_ID, ARC_CHAIN_ID } from '../hooks/useBridge';

interface BridgeModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  asPage?: boolean; // When true, renders as page content instead of modal
}

// Step labels for better UX - Setting expectations upfront
const STEP_LABELS: Record<BridgeStep, { title: string; description: string }> = {
  idle: { title: 'Ready', description: 'Enter amount to bridge' },
  'switching-network': { 
    title: 'Switching Network', 
    description: 'You will be asked to switch to Sepolia network in your wallet' 
  },
  approving: { 
    title: 'Bridge In Progress', 
    description: 'You will be asked to: (1) Approve USDC spend, (2) Confirm the transfer transaction, and (3) Confirm the receive message. Please approve each transaction in your wallet as they appear.' 
  },
  'signing-bridge': { 
    title: 'Bridge In Progress', 
    description: 'You will be asked to: (1) Approve USDC spend, (2) Confirm the transfer transaction, and (3) Confirm the receive message. Please approve each transaction in your wallet as they appear.' 
  },
  'waiting-receive-message': { 
    title: 'Bridge In Progress', 
    description: 'You will be asked to: (1) Approve USDC spend, (2) Confirm the transfer transaction, and (3) Confirm the receive message. Please approve each transaction in your wallet as they appear.' 
  },
  success: { title: 'Bridge Successful', description: 'Your USDC has been successfully transferred to Arc Testnet!' },
  error: { title: 'Bridge Failed', description: 'Bridge transaction failed. Please try again.' },
};

export type BridgeDirection = 'sepolia-to-arc' | 'arc-to-sepolia';

export default function BridgeModal({ isOpen = true, onClose, asPage = false }: BridgeModalProps) {
  const { address, isConnected, chainId } = useAccount();
  
  const [amount, setAmount] = useState('');
  const selectedToken: BridgeToken = 'USDC'; // Only USDC supported
  const [direction, setDirection] = useState<BridgeDirection>('sepolia-to-arc');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [bridgeStartTime, setBridgeStartTime] = useState<number | null>(null);

  const {
    state,
    bridge,
    reset,
    isOnSepolia,
    isOnArc,
    currentChainId,
  } = useBridge();

  const publicClient = usePublicClient();

  // Auto-detect direction based on current chain when component mounts (only if not in success state)
  useEffect(() => {
    if (asPage && currentChainId && state.step !== 'success' && !state.direction) {
      if (currentChainId === ARC_CHAIN_ID) {
        setDirection('arc-to-sepolia');
      } else if (currentChainId === SEPOLIA_CHAIN_ID) {
        setDirection('sepolia-to-arc');
      }
    } else if (isOpen && currentChainId && state.step !== 'success' && !state.direction) {
      if (currentChainId === ARC_CHAIN_ID) {
        setDirection('arc-to-sepolia');
      } else if (currentChainId === SEPOLIA_CHAIN_ID) {
        setDirection('sepolia-to-arc');
      }
    }
  }, [isOpen, asPage, currentChainId, state.step, state.direction]);

  // Use stored direction from bridge state if available (for success screen), otherwise use current direction
  const activeDirection = state.direction || direction;
  
  // Determine source chain ID based on active direction
  const sourceChainId = activeDirection === 'sepolia-to-arc' ? SEPOLIA_CHAIN_ID : ARC_CHAIN_ID;
  const destinationChainId = activeDirection === 'sepolia-to-arc' ? ARC_CHAIN_ID : SEPOLIA_CHAIN_ID;
  const sourceChainName = activeDirection === 'sepolia-to-arc' ? 'Sepolia' : 'Arc Testnet';
  const destinationChainName = activeDirection === 'sepolia-to-arc' ? 'Arc Testnet' : 'Sepolia';

  // Get token info for source chain
  const sourceTokenInfo = CHAIN_TOKENS[sourceChainId]?.[selectedToken];
  const destinationTokenInfo = CHAIN_TOKENS[destinationChainId]?.[selectedToken];

  // ERC20 ABI for balanceOf
  const ERC20_ABI = [
    {
      constant: true,
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      type: 'function',
    },
  ] as const;

  // Fetch balance from source chain using useReadContract (RainbowKit approach)
  // This automatically watches the chain and updates when connected to that chain
  const { data: sourceBalanceRaw, isLoading: isLoadingSourceBalance } = useReadContract({
    address: (sourceTokenInfo?.contractAddress && isConnected && address && currentChainId === sourceChainId) ? sourceTokenInfo.contractAddress as Address : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && isConnected && !!sourceTokenInfo && currentChainId === sourceChainId,
      // Refresh every 5 seconds
      refetchInterval: 5000,
    },
  });

  // For source chain when not connected to it, use separate publicClient
  const sourcePublicClient = useMemo(() => {
    if (currentChainId === sourceChainId || !sourceTokenInfo) return null; // Use wagmi when connected
    
    if (sourceChainId === SEPOLIA_CHAIN_ID) {
      return createPublicClient({
        chain: sepolia,
        transport: http('https://ethereum-sepolia-rpc.publicnode.com', {
          retryCount: 2,
          timeout: 8000,
        }),
      });
    } else if (sourceChainId === ARC_CHAIN_ID) {
      return createPublicClient({
        chain: {
          id: ARC_CHAIN_ID,
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
        },
        transport: http('https://rpc.testnet.arc.network', {
          retryCount: 2,
          timeout: 8000,
        }),
      });
    }
    return null;
  }, [sourceChainId, sourceTokenInfo, currentChainId]);

  // Fetch source balance when not connected to source chain
  const [sourceBalanceManual, setSourceBalanceManual] = useState<string>('0');
  const [isLoadingSourceBalanceManual, setIsLoadingSourceBalanceManual] = useState(false);

  useEffect(() => {
    // Only fetch manually if we're not connected to the source chain
    if (currentChainId === sourceChainId || !sourcePublicClient || !address || !sourceTokenInfo) {
      setSourceBalanceManual('0');
      return;
    }

    let isCancelled = false;
    setIsLoadingSourceBalanceManual(true);

    const fetchSourceBalance = async () => {
      try {
        const balance = await sourcePublicClient.readContract({
          address: sourceTokenInfo.contractAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        if (!isCancelled) {
          const formatted = formatUnits(balance as bigint, sourceTokenInfo.decimals);
          setSourceBalanceManual(formatted);
        }
      } catch (err) {
        console.error('Error fetching source balance:', err);
        if (!isCancelled) {
          setSourceBalanceManual('0');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSourceBalanceManual(false);
        }
      }
    };

    fetchSourceBalance();
    // Refresh every 5 seconds
    const interval = setInterval(fetchSourceBalance, 5000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [sourcePublicClient, address, sourceTokenInfo, currentChainId, sourceChainId]);

  // For destination chain, we need to use a separate publicClient since we might not be connected to it
  // Create a public client for the destination chain
  const destinationPublicClient = useMemo(() => {
    if (!destinationTokenInfo) return null;
    
    if (destinationChainId === SEPOLIA_CHAIN_ID) {
      return createPublicClient({
        chain: sepolia,
        transport: http('https://ethereum-sepolia-rpc.publicnode.com', {
          retryCount: 2,
          timeout: 8000,
        }),
      });
    } else if (destinationChainId === ARC_CHAIN_ID) {
      return createPublicClient({
        chain: {
          id: ARC_CHAIN_ID,
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
        },
        transport: http('https://rpc.testnet.arc.network', {
          retryCount: 2,
          timeout: 8000,
        }),
      });
    }
    return null;
  }, [destinationChainId, destinationTokenInfo]);

  // Fetch destination balance using the separate publicClient
  const [destinationBalance, setDestinationBalance] = useState<string>('0');
  const [isLoadingDestinationBalance, setIsLoadingDestinationBalance] = useState(false);

  useEffect(() => {
    if (!destinationPublicClient || !address || !destinationTokenInfo) {
      setDestinationBalance('0');
      return;
    }

    let isCancelled = false;
    setIsLoadingDestinationBalance(true);

    const fetchDestinationBalance = async () => {
      try {
        const balance = await destinationPublicClient.readContract({
          address: destinationTokenInfo.contractAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        if (!isCancelled) {
          const formatted = formatUnits(balance as bigint, destinationTokenInfo.decimals);
          setDestinationBalance(formatted);
        }
      } catch (err) {
        console.error('Error fetching destination balance:', err);
        if (!isCancelled) {
          setDestinationBalance('0');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDestinationBalance(false);
        }
      }
    };

    fetchDestinationBalance();
    // Refresh every 5 seconds
    const interval = setInterval(fetchDestinationBalance, 5000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [destinationPublicClient, address, destinationTokenInfo]);

  // Format source balance - use wagmi when connected to source chain, otherwise use manual fetch
  const tokenBalance = useMemo(() => {
    if (currentChainId === sourceChainId) {
      // Use wagmi result when connected to source chain
      if (!sourceBalanceRaw || !sourceTokenInfo) return '0';
      return formatUnits(sourceBalanceRaw as bigint, sourceTokenInfo.decimals);
    } else {
      // Use manual fetch result when not connected to source chain
      return sourceBalanceManual;
    }
  }, [currentChainId, sourceChainId, sourceBalanceRaw, sourceTokenInfo, sourceBalanceManual]);

  const isLoadingBalance = currentChainId === sourceChainId ? isLoadingSourceBalance : isLoadingSourceBalanceManual;
  const balanceError = '';

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen && !asPage) {
      setAmount('');
      reset();
    }
  }, [isOpen, asPage, reset]);

  // Timer effect during bridging - starts when isLoading becomes true
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (state.isLoading) {
      // Start timer when bridge begins
      if (!bridgeStartTime) {
        setBridgeStartTime(Date.now());
        setElapsedTime(0);
      }
      
      interval = setInterval(() => {
        if (bridgeStartTime) {
          const elapsed = Math.floor((Date.now() - bridgeStartTime) / 1000);
          setElapsedTime(elapsed);
        }
      }, 1000);
    } else {
      // Reset timer when bridge completes or errors
      setElapsedTime(0);
      setBridgeStartTime(null);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isLoading, bridgeStartTime]);

  // Confetti effect - only trigger when receive message transaction is confirmed
  // This means the bridge is fully complete, not just when source transaction is done
  // Only show confetti if transaction is successful (not rejected/cancelled)
  useEffect(() => {
    // Only trigger confetti when:
    // 1. State is success (not error)
    // 2. We have a receiveTxHash (receive message is confirmed)
    // 3. We're not in error state
    // 4. Ensure we're not in a loading state (shouldn't happen but defensive)
    if (
      state.step === 'success' && 
      state.receiveTxHash && 
      !state.error &&
      !state.isLoading
    ) {
      // Trigger confetti animation
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: NodeJS.Timeout = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Launch from left side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        
        // Launch from right side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      // Cleanup
      return () => clearInterval(interval);
    }
  }, [state.step, state.receiveTxHash, state.error, state.isLoading]);

  const handleBridge = async () => {
    await bridge(selectedToken, amount, direction);
  };

  // Format elapsed time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    reset();
    setAmount('');
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen && !asPage) return null;

  const content = (
    <div className={`${asPage ? 'w-full max-w-2xl mx-auto px-4' : ''}`}>
    <motion.div
        className="bg-white rounded-3xl p-6 md:p-8 border border-orange-200 shadow-xl relative overflow-hidden"
        style={{
          boxShadow: `
            0 0 20px rgba(251, 146, 60, 0.15),
            0 0 40px rgba(251, 146, 60, 0.1),
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.9)
          `
        }}
        initial={asPage ? { opacity: 0, y: 20 } : { opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3 relative z-10">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Bridge Tokens</h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-600 mt-1">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium mr-2">Cross-Chain</span>
              <span className="hidden sm:inline">Transfer USDC between Sepolia and Arc Testnet</span>
              <span className="sm:hidden">Sepolia ↔ Arc Testnet</span>
            </p>
          </div>
          {!asPage && (
          <motion.button
            onClick={handleClose}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="w-5 h-5 text-gray-600" />
          </motion.button>
          )}
        </div>

        {/* Content */}
        <div className="relative z-10">
          {state.step === 'idle' && (
            <div className="space-y-6">
              {/* Chain Display with Swap Button */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
                  <div className="text-center flex-1 w-full sm:w-auto">
                    <p className="text-xs text-gray-600 mb-1">From</p>
                    <div className="flex items-center justify-center space-x-2 mb-1">
                      <img 
                        src={sourceChainId === SEPOLIA_CHAIN_ID ? "/sepolia.png" : "/Arc.png"} 
                        alt={sourceChainName} 
                        className="w-5 h-5 sm:w-6 sm:h-6"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <p className="font-bold text-gray-900 text-sm sm:text-base">{sourceChainName}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 hidden sm:block">Chain ID: {sourceChainId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection(direction === 'sepolia-to-arc' ? 'arc-to-sepolia' : 'sepolia-to-arc');
                    }}
                    disabled={state.isLoading}
                    className="p-2 sm:mx-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed rotate-90 sm:rotate-0"
                    title="Swap chains"
                  >
                    <ArrowLeftRight className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="text-center flex-1 w-full sm:w-auto">
                    <p className="text-xs text-gray-600 mb-1">To</p>
                    <div className="flex items-center justify-center space-x-2 mb-1">
                      <img 
                        src={destinationChainId === SEPOLIA_CHAIN_ID ? "/sepolia.png" : "/Arc.png"} 
                        alt={destinationChainName} 
                        className="w-5 h-5 sm:w-6 sm:h-6"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <p className="font-bold text-gray-900 text-sm sm:text-base">{destinationChainName}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 hidden sm:block">Chain ID: {destinationChainId}</p>
                  </div>
                </div>
              </div>

               {/* Token Display */}
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                   Token
                 </label>
                 <div className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 flex items-center justify-between">
                   <div className="flex items-center space-x-3">
                     <img 
                       src="/usdc.svg" 
                       alt="USDC" 
                       className="w-6 h-6"
                       onError={(e) => {
                         // Hide icon if it fails to load
                         (e.target as HTMLImageElement).style.display = 'none';
                       }}
                     />
                     <div>
                       <span className="font-medium text-gray-900">USDC</span>
                       <span className="text-xs text-gray-500 ml-2">(USD Coin)</span>
                     </div>
                   </div>
                 </div>
                 <p className="text-xs text-gray-500 mt-2">
                   Bridge Kit supports USDC for bidirectional bridging between Sepolia and Arc Testnet
                 </p>
               </div>

              {/* Token Balance Display */}
              {isConnected && address && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <img 
                        src="/usdc.svg" 
                        alt="USDC" 
                        className="w-5 h-5"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div>
                        <p className="text-xs text-orange-700 font-medium mb-1">{sourceChainName} {selectedToken} Balance</p>
                        {isLoadingBalance ? (
                          <div className="flex items-center space-x-2">
                            <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                            <span className="text-sm text-orange-800">Loading...</span>
                          </div>
                        ) : (
                          <p className="text-lg font-bold text-orange-900">
                            {parseFloat(tokenBalance) > 0 
                              ? `${parseFloat(tokenBalance).toFixed(2)} ${selectedToken}`
                              : `0.00 ${selectedToken}`
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      {CHAIN_TOKENS[sourceChainId] && (
                        <p className="text-xs text-orange-600 font-mono break-all">
                          {CHAIN_TOKENS[sourceChainId][selectedToken].contractAddress.slice(0, 6)}...{CHAIN_TOKENS[sourceChainId][selectedToken].contractAddress.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                  {balanceError && (
                    <div className="mt-2 pt-2 border-t border-orange-200">
                      <p className="text-xs text-amber-600">
                        ⚠️ {balanceError}
                      </p>
                    </div>
                  )}
                  {parseFloat(tokenBalance) === 0 && !isLoadingBalance && !balanceError && (
                    <div className="mt-3 pt-3 border-t border-orange-200">
                      <p className="text-xs text-orange-700 mb-2">
                        ⚠️ You need {selectedToken} at the Bridge Kit contract address to bridge
                      </p>
                      <a
                        href="https://faucet.circle.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                      >
                        <span>Get {selectedToken} on Sepolia here</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount ({selectedToken})
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-base sm:text-lg"
                  disabled={state.isLoading}
                />
                 <p className="text-xs text-gray-500 mt-2">
                   Enter the amount to bridge to {destinationChainName}
                 </p>
              </div>

              {/* Warning if not on source chain */}
              {isConnected && chainId !== sourceChainId && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium">Auto-switch to {sourceChainName}</p>
                      <p className="text-xs mt-1">
                        Bridge Kit will automatically switch your network to {sourceChainName} when you start the bridge process. 
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Connect Wallet Prompt */}
              {!isConnected && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-800">
                    Please connect your wallet to bridge tokens
                  </p>
                </div>
              )}

              {/* Bridge Button */}
              <button
                onClick={handleBridge}
                disabled={!isConnected || !amount || parseFloat(amount) <= 0 || state.isLoading}
                className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 ${
                  !isConnected || !amount || parseFloat(amount) <= 0 || state.isLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-lg active:scale-95'
                }`}
              >
                {state.isLoading ? 'Processing...' : `Bridge ${selectedToken}`}
              </button>
            </div>
          )}

          {/* Bridge In Progress - Simplified with Timer */}
          {(state.step !== 'idle' && state.step !== 'success' && state.step !== 'error') && (
            <div className="space-y-6">
              {/* Timer and Spinner */}
              <div className="bg-gray-50 rounded-xl p-4 sm:p-6 border border-gray-200 text-center">
                <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-orange-500 animate-spin mx-auto mb-4" />
                
                {/* Timer Display */}
                <div className="mb-4">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Bridge in Progress</p>
                  <div className="flex items-center justify-center space-x-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">
                      {formatTime(elapsedTime)}
                    </p>
                  </div>
                </div>
                
                {/* Status Message */}
                <div className="space-y-2">
                  <p className="text-base sm:text-lg font-bold text-gray-900">
                    {state.step === 'switching-network' 
                      ? 'Switching Network' 
                      : 'Processing Bridge'}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                    {state.step === 'switching-network'
                      ? `You will be asked to switch to ${sourceChainName} network in your wallet.`
                      : `You will be asked to approve transactions in your wallet. Please approve each transaction as it appears. The bridge will automatically handle the transfer and receive message confirmation.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {state.step === 'success' && (
            <div className="space-y-4 text-center relative z-10">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-2">Bridge Successful!</p>
                <p className="text-sm text-gray-600 mb-4">
                  Your {selectedToken} has been successfully transferred from {sourceChainName} to {destinationChainName}.
                </p>
                
                 {/* Transaction Links */}
                 <div className="space-y-2 mb-4">
                   {state.sourceTxHash && (
                     <a
                       href={
                         sourceChainId === SEPOLIA_CHAIN_ID
                           ? `https://sepolia.etherscan.io/tx/${state.sourceTxHash}`
                           : `https://testnet.arcscan.app/tx/${state.sourceTxHash}`
                       }
                       target="_blank"
                       rel="noopener noreferrer"
                       className="inline-flex items-center space-x-2 text-orange-600 hover:text-orange-700 text-sm block"
                     >
                       <span>View {sourceChainName} Transaction</span>
                       <ExternalLink className="w-4 h-4" />
                     </a>
                   )}
                   {state.receiveTxHash ? (
                     <a
                       href={
                         destinationChainId === SEPOLIA_CHAIN_ID
                           ? `https://sepolia.etherscan.io/tx/${state.receiveTxHash}`
                           : `https://testnet.arcscan.app/tx/${state.receiveTxHash}`
                       }
                       target="_blank"
                       rel="noopener noreferrer"
                       className="inline-flex items-center space-x-2 text-orange-600 hover:text-orange-700 text-sm block"
                     >
                       <span>View Receive Message Transaction</span>
                       <ExternalLink className="w-4 h-4" />
                     </a>
                   ) : (
                     <div className="text-xs text-gray-500 pt-2">
                       <p>Receive message transaction hash will be available after confirmation.</p>
                       <p className="mt-1">Check the browser console for details or {destinationChainName} explorer later.</p>
                     </div>
                   )}
                   {!state.sourceTxHash && !state.receiveTxHash && state.result && (state.result as any)?.txHash && (
                     <a
                       href={
                         sourceChainId === SEPOLIA_CHAIN_ID
                           ? `https://sepolia.etherscan.io/tx/${(state.result as any).txHash}`
                           : `https://testnet.arcscan.app/tx/${(state.result as any).txHash}`
                       }
                       target="_blank"
                       rel="noopener noreferrer"
                       className="inline-flex items-center space-x-2 text-orange-600 hover:text-orange-700 text-sm block"
                     >
                       <span>View Transaction</span>
                       <ExternalLink className="w-4 h-4" />
                     </a>
                   )}
                 </div>
              </div>
              <motion.button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClose();
                }}
                className="mt-4 w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3 bg-orange-500 text-white rounded-xl font-semibold text-base sm:text-lg hover:bg-orange-600 active:bg-orange-700 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed relative z-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
              >
                Close
              </motion.button>
            </div>
          )}

          {/* Error */}
          {state.step === 'error' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 mb-2">Bridge Failed</p>
                <div className="text-sm text-red-600 mb-4 max-h-40 overflow-y-auto text-left bg-red-50 p-3 rounded-lg">
                  <p className="whitespace-pre-wrap break-words">{state.error}</p>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Check the browser console for detailed {selectedToken} contract address information.
                </p>
                <motion.button
                  onClick={() => {
                    reset();
                    setAmount('');
                  }}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3 bg-orange-500 text-white rounded-xl font-semibold text-base sm:text-lg hover:bg-orange-600 active:bg-orange-700 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Try Again
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  if (asPage) {
    return content;
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </motion.div>
  );
}


