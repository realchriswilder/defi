import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownUp, Settings, Info, ChevronDown, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { useDEX, useTokenBalance, useSwapOutput, useTokenAllowance, usePoolReserves, TOKENS, type TokenSymbol, usePoolAddress } from '../hooks/useDEX';
import { ERC20_ABI } from '../config/abis';
import { parseUnits, type Address } from 'viem';
import { getPoolAddress } from '../hooks/useDEX';
import TokenLogo from './TokenLogo';
import { addArcTestnetToWallet } from '../utils/addArcTestnet';

const AVAILABLE_TOKENS: TokenSymbol[] = ['RAC', 'RACD', 'RACA', 'USDC'];

export default function Swap() {
  const { isConnected, address, chainId } = useAccount();
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromToken, setFromToken] = useState<TokenSymbol>('RAC');
  const [toToken, setToToken] = useState<TokenSymbol>('RACD');
  const [slippage, setSlippage] = useState('0.5');
  const [showSettings, setShowSettings] = useState(false);
  const [showTokenSelector, setShowTokenSelector] = useState<'from' | 'to' | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isCalculatingOutput, setIsCalculatingOutput] = useState(false);

  const { swap, approveForSwap, isPending, isConfirming, isSuccess, error, hash } = useDEX();
  const fromBalance = useTokenBalance(fromToken);
  const toBalance = useTokenBalance(toToken);
  const estimatedOutput = useSwapOutput(fromToken, toToken, fromAmount);
  const publicClient = usePublicClient();
  
  // Get pool address using the hook
  const poolAddress = usePoolAddress(fromToken, toToken);
  
  const [swapStep, setSwapStep] = useState<'none' | 'approving' | 'swapping'>('none');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [approvalCompleted, setApprovalCompleted] = useState(false);
  const [swapHash, setSwapHash] = useState<`0x${string}` | null>(null);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [swapConfirmed, setSwapConfirmed] = useState(false);
  const [swapStartTime, setSwapStartTime] = useState<number | null>(null);
  
  // Check if on Arc Testnet
  const isArcTestnet = chainId === 5042002;

  // Format error message
  const formatSwapError = (err: any): string => {
    if (!err) return 'Unknown error occurred';
    
    const errorStr = err.message || err.toString() || '';
    
    // Rate limiting errors (check first as it's common)
    if (errorStr.includes('rate limit') || 
        errorStr.includes('rate limited') ||
        errorStr.includes('Request is being rate limited') ||
        errorStr.includes('rate Limited')) {
      return 'The network is currently busy. Please wait a moment and try again.';
    }
    
    // User rejection errors
    if (errorStr.includes('User rejected') || 
        errorStr.includes('User denied') || 
        errorStr.includes('rejected the request') ||
        errorStr.includes('denied transaction signature')) {
      return 'Transaction was cancelled. Please try again when ready.';
    }
    
    // Network errors
    if (errorStr.includes('network') || errorStr.includes('Network')) {
      return 'Network error. Please check your connection and try again.';
    }
    
    // Gas errors
    if (errorStr.includes('gas') || errorStr.includes('insufficient funds')) {
      return 'Insufficient funds for gas. Please ensure you have enough balance.';
    }
    
    // Allowance errors
    if (errorStr.includes('allowance') || errorStr.includes('Allowance')) {
      return 'Token approval required. Please approve and try again.';
    }
    
    // Pool errors
    if (errorStr.includes('Pool not found') || errorStr.includes('pool')) {
      return 'Pool not found. Please create the pool first.';
    }
    
    // For technical errors, extract just the reason if available
    if (errorStr.includes('reverted with the following reason:')) {
      const reasonMatch = errorStr.match(/reverted with the following reason:\s*(.+?)(?:\.|Contract|$)/i);
      if (reasonMatch && reasonMatch[1]) {
        const reason = reasonMatch[1].trim();
        // Already handled rate limiting above, but check again for variations
        if (reason.includes('rate limit')) {
          return 'The network is currently busy. Please wait a moment and try again.';
        }
        // Return the clean reason without technical details
        return reason.charAt(0).toUpperCase() + reason.slice(1);
      }
    }
    
    return 'An unexpected error occurred. Please try again.';
  };

  // Format output amount with appropriate decimals
  const formatOutputAmount = (amount: string, token: TokenSymbol) => {
    if (!amount || amount === '0') return '0';
    const num = parseFloat(amount);
    if (num === 0) return '0';
    
    const tokenDecimals = TOKENS[token].decimals;
    // For 18 decimals: show up to 6 decimal places if < 1, otherwise 4
    // For 6 decimals: show up to 4 decimal places if < 1, otherwise 2
    if (num < 1) {
      return num.toFixed(Math.min(tokenDecimals, 6));
    } else if (num < 100) {
      return num.toFixed(4);
    } else {
      return num.toFixed(2);
    }
  };

  // Close token selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showTokenSelector) {
        setShowTokenSelector(null);
      }
    };
    if (showTokenSelector) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTokenSelector]);

  // Get pool reserves for price calculations
  const poolReserves = usePoolReserves(fromToken, toToken);

  // Calculate exchange rate (spot price)
  const exchangeRate = useMemo(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || !toAmount || parseFloat(toAmount) <= 0) return null;
    const rate = parseFloat(toAmount) / parseFloat(fromAmount);
    return rate;
  }, [fromAmount, toAmount]);

  // Calculate price impact
  const priceImpact = useMemo(() => {
    if (!poolReserves.reserveA || !poolReserves.reserveB || !fromAmount || parseFloat(fromAmount) <= 0) return null;
    
    const reserveA = parseFloat(poolReserves.reserveA);
    const reserveB = parseFloat(poolReserves.reserveB);
    
    // Determine which reserve is which token
    const fromTokenAddr = TOKENS[fromToken].address.toLowerCase();
    const toTokenAddr = TOKENS[toToken].address.toLowerCase();
    const isFromTokenA = fromTokenAddr < toTokenAddr;
    
    const reserveIn = isFromTokenA ? reserveA : reserveB;
    const reserveOut = isFromTokenA ? reserveB : reserveA;
    
    if (reserveIn === 0 || reserveOut === 0) return null;
    
    // Calculate spot price before swap
    const spotPrice = reserveOut / reserveIn;
    
    // Calculate price after swap (simplified - using constant product formula)
    const amountIn = parseFloat(fromAmount);
    // Fee is 0.3% (30 bps) - 10000 - 30 = 9970
    const amountInWithFee = amountIn * 0.997;
    const newReserveIn = reserveIn + amountInWithFee;
    const newReserveOut = (reserveIn * reserveOut) / newReserveIn;
    const amountOut = reserveOut - newReserveOut;
    
    // Calculate execution price
    const executionPrice = amountOut / amountIn;
    
    // Price impact = (execution price - spot price) / spot price * 100
    const impact = ((executionPrice - spotPrice) / spotPrice) * 100;
    
    return impact > 0 ? impact : 0;
  }, [poolReserves, fromAmount, fromToken, toToken]);

  // Calculate minimum receive amount (with slippage)
  const minReceive = useMemo(() => {
    if (!toAmount || parseFloat(toAmount) <= 0) return '0';
    const slippagePercent = parseFloat(slippage) / 100;
    const min = parseFloat(toAmount) * (1 - slippagePercent);
    return min.toFixed(6);
  }, [toAmount, slippage]);

  // Update output amount when input changes with loading state
  useEffect(() => {
    if (fromAmount && fromAmount !== '' && parseFloat(fromAmount) > 0) {
      setIsCalculatingOutput(true);
      // Small delay to show loading
      const timer = setTimeout(() => {
        if (estimatedOutput && estimatedOutput !== '0') {
          const formatted = formatOutputAmount(estimatedOutput, toToken);
          setToAmount(formatted);
        }
        setIsCalculatingOutput(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setToAmount('');
      setIsCalculatingOutput(false);
    }
  }, [fromAmount, estimatedOutput, toToken]);

  // Check if approval is needed
  const fromTokenInfo = TOKENS[fromToken];
  const fromAmountWei = fromAmount && !isNaN(parseFloat(fromAmount)) && parseFloat(fromAmount) > 0
    ? parseUnits(fromAmount, fromTokenInfo.decimals)
    : 0n;
  
  const currentAllowance = useTokenAllowance(fromToken, poolAddress);
  const needsApproval = poolAddress && currentAllowance < fromAmountWei;

  // Track when approval completes and auto-proceed to swap
  useEffect(() => {
    if (isSuccess && swapStep === 'approving' && !approvalCompleted && poolAddress && address && publicClient) {
      const proceedToSwap = async () => {
        try {
          // Mark approval as completed to prevent re-triggering
          setApprovalCompleted(true);
          
          // Wait a moment for state to update
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Check fresh allowance
          const freshAllowance = await publicClient.readContract({
            address: fromTokenInfo.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, poolAddress],
          });

          if (freshAllowance >= fromAmountWei) {
            // Approval confirmed, proceed to swap
            setSwapStep('swapping');
            await swap(fromToken, toToken, fromAmount);
          } else {
            throw new Error('Approval incomplete');
          }
        } catch (err: any) {
          console.error('Error proceeding to swap:', err);
          setErrorMessage(formatSwapError(err));
          setSwapStep('none');
          setShowProgressModal(false);
          setApprovalCompleted(false);
        }
      };

      proceedToSwap();
    }
  }, [isSuccess, swapStep, approvalCompleted, poolAddress, address, publicClient, fromToken, toToken, fromAmount, fromAmountWei, fromTokenInfo, swap]);

  // Track swap transaction hash when it's initiated
  useEffect(() => {
    if (hash && swapStep === 'swapping' && !swapHash) {
      // Capture the swap transaction hash
      setSwapHash(hash);
      setSwapStartTime(Date.now());
      setSwapConfirmed(false);
    }
  }, [hash, swapStep, swapHash]);

  // Auto-confirm swap success after 5 seconds if we have a hash (since chain is fast)
  useEffect(() => {
    if (swapHash && swapStep === 'swapping' && !swapConfirmed && swapStartTime) {
      const elapsed = Date.now() - swapStartTime;
      const remaining = Math.max(0, 5000 - elapsed); // 5 seconds total
      
      if (remaining > 0) {
        const timeoutId = setTimeout(() => {
          // After 5 seconds, mark as confirmed
          setSwapConfirmed(true);
        }, remaining);
        
        return () => clearTimeout(timeoutId);
      } else {
        // Already past 5 seconds
        setSwapConfirmed(true);
      }
    }
  }, [swapHash, swapStep, swapConfirmed, swapStartTime]);

  // Track swap progress and errors
  useEffect(() => {
    // Only show modal and track progress during active steps
    if (swapStep !== 'none') {
      if (isPending || isConfirming) {
        if (!showProgressModal) {
          setShowProgressModal(true);
        }
      } else if (swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming) {
        // Show success if either isSuccess is true OR 5 seconds have passed (chain is fast)
        // Close modal after 5 seconds
        const timeoutId = setTimeout(() => {
          setShowProgressModal(false);
          setSwapStep('none');
          setFromAmount('');
          setToAmount('');
          setApprovalCompleted(false);
          setSwapHash(null);
          setSwapConfirmed(false);
          setSwapStartTime(null);
        }, 5000); // Close after 5 seconds
        
        return () => clearTimeout(timeoutId);
      } else if (error && swapStep === 'swapping') {
        // Only show error if we're actually in the swapping step
        const errorMsg = formatSwapError(error);
        setErrorMessage(errorMsg);
        const timeoutId = setTimeout(() => {
          setShowProgressModal(false);
          setSwapStep('none');
          setApprovalCompleted(false);
          setSwapHash(null);
          setSwapConfirmed(false);
          setSwapStartTime(null);
        }, 3000);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [isPending, isConfirming, isSuccess, error, swapStep, showProgressModal, swapHash, swapConfirmed]);

  const handleAmountChange = (value: string, type: 'from' | 'to') => {
    if (type === 'from') {
      setFromAmount(value);
    } else {
      setToAmount(value);
    }
  };

  const swapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const handleSwapClick = async () => {
    // If not connected, let RainbowKit handle connection
    if (!isConnected) {
      return;
    }

    // If not on Arc Testnet, try to add/switch to it
    if (!isArcTestnet) {
      setIsSwitchingNetwork(true);
      setErrorMessage(null);
      try {
        // Try to add Arc Testnet to wallet first (this handles adding and switching)
        await addArcTestnetToWallet();
        // The addArcTestnetToWallet function already switches to the chain
        // If we still need to use wagmi's switchChain, wait a moment first
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error('Error adding/switching to Arc Testnet:', error);
        const errorMsg = error.message || 'Failed to add Arc Testnet to wallet. Please add it manually in MetaMask settings.';
        setErrorMessage(errorMsg);
      } finally {
        setIsSwitchingNetwork(false);
      }
      return;
    }

    // If on correct network, proceed with swap
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    if (!publicClient || !address || !poolAddress) {
      setErrorMessage('Pool not found. Please create the pool first.');
      return;
    }
    // Show review modal first
    setShowReviewModal(true);
  };

  const handleConfirmSwap = async () => {
    if (!isConnected || !fromAmount || parseFloat(fromAmount) <= 0) return;
    if (!publicClient || !address || !poolAddress) {
      setErrorMessage('Pool not found. Please create the pool first.');
      setShowReviewModal(false);
      return;
    }
    
    setShowReviewModal(false);
    
    try {
      // Reset state for new swap attempt
      setErrorMessage(null);
      setApprovalCompleted(false);
      setSwapHash(null);
      setSwapConfirmed(false);
      setSwapStartTime(null);
      
      // Check if approval is needed
      if (needsApproval) {
        // Need approval first
        setSwapStep('approving');
        setShowProgressModal(true);
        approveForSwap(fromToken, poolAddress);
      } else {
        // Already approved, proceed directly to swap
        setSwapStep('swapping');
        setShowProgressModal(true);
        setApprovalCompleted(true); // Skip approval tracking
        await swap(fromToken, toToken, fromAmount);
      }
    } catch (err: any) {
      console.error('Swap error:', err);
      const errorMsg = formatSwapError(err);
      setErrorMessage(errorMsg);
      setShowProgressModal(false);
      setSwapStep('none');
      setApprovalCompleted(false);
      setSwapHash(null);
      setSwapConfirmed(false);
      setSwapStartTime(null);
    }
  };

  const selectToken = (token: TokenSymbol) => {
    if (showTokenSelector === 'from') {
      if (token === toToken) {
        // Swap tokens if selecting the same as 'to'
        setToToken(fromToken);
      }
      setFromToken(token);
    } else if (showTokenSelector === 'to') {
      if (token === fromToken) {
        // Swap tokens if selecting the same as 'from'
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setShowTokenSelector(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <motion.div
        className="bg-white rounded-3xl p-6 md:p-8 border border-orange-200 shadow-xl relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          boxShadow: `
            0 0 20px rgba(251, 146, 60, 0.15),
            0 0 40px rgba(251, 146, 60, 0.1),
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.9)
          `
        }}
      >

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4 relative z-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-1">Swap</h2>
            <p className="text-sm md:text-base text-gray-600 flex items-center gap-2">
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium">Arc Testnet Only</span>
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 sm:p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all self-start sm:self-auto"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200 relative z-10"
          >
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slippage Tolerance (%)
            </label>
            <div className="flex flex-wrap gap-2">
              {['0.1', '0.5', '1.0'].map((val) => (
                <button
                  key={val}
                  onClick={() => setSlippage(val)}
                  className={`flex-1 min-w-[60px] py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    slippage === val
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {val}%
                </button>
              ))}
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-20 px-2 py-2 rounded-lg border border-gray-300 bg-white text-xs sm:text-sm text-center"
                placeholder="Custom"
                step="0.1"
                min="0"
              />
            </div>
          </motion.div>
        )}

        {/* From Token */}
        <div className="mb-4 relative">
          <div className="bg-orange-50 rounded-2xl p-3 sm:p-4 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">From</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                Balance: {parseFloat(fromBalance).toFixed(4)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  value={fromAmount}
                  onChange={(e) => handleAmountChange(e.target.value, 'from')}
                  placeholder="0.0"
                  className="w-full text-2xl md:text-3xl lg:text-4xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-400"
                />
              </div>
              <div className="relative">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTokenSelector(showTokenSelector === 'from' ? null : 'from');
                  }}
                  className="flex items-center justify-between sm:justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-white rounded-xl hover:bg-gray-50 transition-all border border-gray-200 w-full sm:w-auto"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center gap-2">
                    <TokenLogo token={fromToken} size={32} className="flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm sm:text-base">{fromToken}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-600 hidden sm:block" />
                </motion.button>
                <AnimatePresence>
                  {showTokenSelector === 'from' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 bg-white rounded-xl border border-gray-200 shadow-2xl z-[100] min-w-[200px] w-full sm:w-auto max-h-[300px] overflow-y-auto scrollbar-hide"
                    >
                    {AVAILABLE_TOKENS.map((token) => (
                      <motion.button
                        key={token}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectToken(token);
                        }}
                        whileHover={{ scale: 1.02, x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl ${
                          fromToken === token ? 'bg-orange-50' : ''
                        }`}
                      >
                        <TokenLogo token={token} size={32} className="flex-shrink-0" />
                        <span className="font-semibold text-gray-900">{token}</span>
                      </motion.button>
                    ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center relative z-20 my-2">
          <motion.button
            onClick={swapTokens}
            className="p-3 bg-white rounded-full border-4 border-white shadow-lg hover:shadow-xl transition-all relative z-10"
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            style={{
              boxShadow: `
                0 0 20px rgba(251, 146, 60, 0.2),
                0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -1px rgba(0, 0, 0, 0.06)
              `
            }}
          >
            <ArrowDownUp className="w-5 h-5 text-gray-700" />
          </motion.button>
        </div>

        {/* To Token */}
        <div className="mb-6 relative">
          <div className="bg-orange-50 rounded-2xl p-3 sm:p-4 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">To</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                Balance: {parseFloat(toBalance).toFixed(4)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  value={toAmount}
                  onChange={(e) => handleAmountChange(e.target.value, 'to')}
                  placeholder="0.0"
                  className="w-full text-2xl md:text-3xl lg:text-4xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-400"
                  readOnly
                />
              </div>
              <div className="relative">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTokenSelector(showTokenSelector === 'to' ? null : 'to');
                  }}
                  className="flex items-center justify-between sm:justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-white rounded-xl hover:bg-gray-50 transition-all border border-gray-200 w-full sm:w-auto"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center gap-2">
                    <TokenLogo token={toToken} size={32} className="flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm sm:text-base">{toToken}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-600 hidden sm:block" />
                </motion.button>
                <AnimatePresence>
                  {showTokenSelector === 'to' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 bg-white rounded-xl border border-gray-200 shadow-2xl z-[100] min-w-[200px] w-full sm:w-auto max-h-[300px] overflow-y-auto scrollbar-hide"
                    >
                      {AVAILABLE_TOKENS.map((token) => (
                        <motion.button
                          key={token}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectToken(token);
                          }}
                          whileHover={{ scale: 1.02, x: 4 }}
                          whileTap={{ scale: 0.98 }}
                          className={`w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl ${
                            toToken === token ? 'bg-orange-50' : ''
                          }`}
                        >
                          <TokenLogo token={token} size={32} className="flex-shrink-0" />
                          <span className="font-semibold text-gray-900">{token}</span>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Swap Details */}
        {fromAmount && toAmount && parseFloat(fromAmount) > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 space-y-2"
          >
            {/* Exchange Rate */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>Rate</span>
                </div>
                <span className="font-medium text-gray-900 break-all sm:break-normal">
                  {exchangeRate ? `1 ${fromToken} = ${exchangeRate.toFixed(6)} ${toToken}` : 'Calculating...'}
                </span>
              </div>
            </div>
            
            {/* Price Impact */}
            {priceImpact !== null && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    <span>Price impact</span>
                  </div>
                  <span className={`font-medium ${
                    priceImpact > 5 ? 'text-red-600' : priceImpact > 1 ? 'text-yellow-600' : 'text-gray-900'
                  }`}>
                    {priceImpact.toFixed(3)}%
                  </span>
                </div>
              </div>
            )}

            {/* Max Slippage */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  <span>Max slippage</span>
                </div>
                <span className="font-medium text-gray-900">
                  {slippage}%
                </span>
              </div>
            </div>

            {/* Minimum Receive */}
            {minReceive && parseFloat(minReceive) > 0 && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    <span>Receive at least</span>
                  </div>
                  <span className="font-medium text-gray-900">
                    {minReceive} {toToken}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Warning for wrong network */}
        {isConnected && !isArcTestnet && (
          <div className="mb-4 p-3 bg-red-50/80 rounded-xl border border-red-200/50 flex items-start gap-2 relative z-10">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Wrong Network</p>
              <p className="text-xs mt-1">Please switch to Arc Testnet to use this DEX</p>
            </div>
          </div>
        )}

        {/* Warning for unconnected wallet */}
        {!isConnected && (
          <div className="mb-4 p-3 bg-yellow-50/80 rounded-xl border border-yellow-200/50 flex items-start gap-2 relative z-10">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Connect Wallet</p>
              <p className="text-xs mt-1">Connect your wallet to start swapping tokens</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {isSuccess && (
          <div className="mb-4 p-3 bg-green-50/80 rounded-xl border border-green-200/50 flex items-start gap-2 relative z-10">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Swap Successful!</p>
            </div>
          </div>
        )}

        {/* Error Message - Only show when not in modal */}
        {errorMessage && !showProgressModal && (
          <div className="mb-4 p-3 bg-red-50/80 rounded-xl border border-red-200/50 flex items-start gap-2 relative z-10">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Transaction Failed</p>
              <p className="text-xs mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <motion.button
          onClick={handleSwapClick}
          disabled={!isConnected || (!isArcTestnet && !isSwitchingNetwork) || !fromAmount || parseFloat(fromAmount) <= 0 || isPending || isConfirming || isCalculatingOutput || isSwitchingNetwork}
          className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 relative z-0 flex items-center justify-center gap-2 ${
            !isConnected || (!isArcTestnet && !isSwitchingNetwork) || !fromAmount || parseFloat(fromAmount) <= 0 || isPending || isConfirming || isCalculatingOutput || isSwitchingNetwork
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-lg active:scale-95'
          }`}
          whileHover={!isConnected || (!isArcTestnet && !isSwitchingNetwork) || !fromAmount || parseFloat(fromAmount) <= 0 || isPending || isConfirming || isCalculatingOutput || isSwitchingNetwork ? {} : { scale: 1.02 }}
          whileTap={!isConnected || (!isArcTestnet && !isSwitchingNetwork) || !fromAmount || parseFloat(fromAmount) <= 0 || isPending || isConfirming || isCalculatingOutput || isSwitchingNetwork ? {} : { scale: 0.98 }}
        >
          {(isPending || isConfirming || isCalculatingOutput || isSwitchingNetwork) && <Loader2 className="w-5 h-5 animate-spin" />}
          {!isConnected
            ? 'Connect Wallet'
            : isSwitchingNetwork
            ? 'Adding Arc Testnet...'
            : !isArcTestnet
            ? 'Add Arc Testnet'
            : !fromAmount || parseFloat(fromAmount) <= 0
            ? 'Enter Amount'
            : isCalculatingOutput
            ? 'Calculating...'
            : isPending || isConfirming
            ? 'Processing...'
            : `Swap ${fromToken} for ${toToken}`}
        </motion.button>

        {/* Review Modal */}
        <AnimatePresence>
          {showReviewModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowReviewModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative"
                style={{
                  boxShadow: `
                    0 0 30px rgba(251, 146, 60, 0.25),
                    0 0 60px rgba(251, 146, 60, 0.15),
                    0 10px 25px -5px rgba(0, 0, 0, 0.1),
                    0 4px 6px -2px rgba(0, 0, 0, 0.05),
                    inset 0 1px 0 rgba(255, 255, 255, 0.9)
                  `
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Review swap</h3>
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* You Pay */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">You pay</p>
                    <div className="flex items-center justify-between">
                      <p className="text-2xl font-bold text-gray-900">{fromAmount} {fromToken}</p>
                      <TokenLogo token={fromToken} size={40} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                      Balance: {parseFloat(fromBalance).toFixed(4)} {fromToken}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowDownUp className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* You Receive */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">You receive</p>
                    <div className="flex items-center justify-between">
                      <p className="text-2xl font-bold text-gray-900">{toAmount} {toToken}</p>
                      <TokenLogo token={toToken} size={40} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                      Balance: {parseFloat(toBalance).toFixed(4)} {toToken}
                    </p>
                  </div>

                  {/* Swap Details */}
                  <div className="space-y-3 pt-4 border-t border-gray-200">
                    {/* Rate */}
                    {exchangeRate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Rate</span>
                        <span className="font-medium text-gray-900">
                          1 {fromToken} = {exchangeRate.toFixed(6)} {toToken}
                        </span>
                      </div>
                    )}

                    {/* Price Impact */}
                    {priceImpact !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price impact</span>
                        <span className={`font-medium ${
                          priceImpact > 5 ? 'text-red-600' : priceImpact > 1 ? 'text-yellow-600' : 'text-gray-900'
                        }`}>
                          {priceImpact.toFixed(3)}%
                        </span>
                      </div>
                    )}

                    {/* Max Slippage */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max. slippage</span>
                      <span className="font-medium text-gray-900">{slippage}%</span>
                    </div>

                    {/* Minimum Receive */}
                    {minReceive && parseFloat(minReceive) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Receive at least</span>
                        <span className="font-medium text-gray-900">
                          {minReceive} {toToken}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Button */}
                  <motion.button
                    onClick={handleConfirmSwap}
                    className="w-full py-4 rounded-xl font-bold text-base bg-orange-500 text-white hover:bg-orange-600 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Confirm swap
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Modal */}
        <AnimatePresence>
          {showProgressModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => {
                // Don't close on background click during transaction
                // Only allow closing if we're not in an active step or if transaction is complete
                if (swapStep === 'none' || (swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming)) {
                  setShowProgressModal(false);
                }
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative"
                style={{
                  boxShadow: `
                    0 0 30px rgba(251, 146, 60, 0.25),
                    0 0 60px rgba(251, 146, 60, 0.15),
                    0 10px 25px -5px rgba(0, 0, 0, 0.1),
                    0 4px 6px -2px rgba(0, 0, 0, 0.05),
                    inset 0 1px 0 rgba(255, 255, 255, 0.9)
                  `
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Swap Progress</h3>
                  {(!isPending && !isConfirming && swapStep === 'none') || (swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming) ? (
                    <button
                      onClick={() => setShowProgressModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  ) : null}
                </div>

                <div className="space-y-6">
                  {/* Approving Step */}
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                      swapStep === 'approving' && (isPending || isConfirming)
                        ? 'bg-orange-500'
                        : swapStep === 'swapping' && approvalCompleted
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    }`}>
                      {swapStep === 'approving' && (isPending || isConfirming) ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : swapStep === 'swapping' && approvalCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold ${
                        swapStep === 'approving' && (isPending || isConfirming)
                          ? 'text-orange-600'
                          : swapStep === 'swapping' && approvalCompleted
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }`}>
                        Approving {fromToken}
                      </p>
                      <p className="text-sm text-gray-500">
                        {swapStep === 'approving' && (isPending || isConfirming)
                          ? 'Waiting for confirmation...'
                          : swapStep === 'swapping' && approvalCompleted
                          ? 'Approval completed'
                          : 'Allow the contract to spend your tokens'}
                      </p>
                    </div>
                  </div>

                  {/* Swapping Step */}
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                      swapStep === 'swapping' && (isPending || isConfirming)
                        ? 'bg-orange-500'
                        : swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    }`}>
                      {swapStep === 'swapping' && (isPending || isConfirming) ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming ? (
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold ${
                        swapStep === 'swapping' && (isPending || isConfirming)
                          ? 'text-orange-600'
                          : swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }`}>
                        Swapping {fromToken} for {toToken}
                      </p>
                      <p className="text-sm text-gray-500">
                        {swapStep === 'swapping' && (isPending || isConfirming)
                          ? 'Waiting for confirmation...'
                          : swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming
                          ? 'Swap completed!'
                          : 'Pending...'}
                      </p>
                    </div>
                  </div>

                  {/* Success Message - Only show when swap is actually confirmed */}
                  {swapStep === 'swapping' && swapHash && (isSuccess || swapConfirmed) && !isPending && !isConfirming && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200"
                    >
                      <p className="text-sm font-medium text-green-800 text-center">
                        Swap completed successfully! 🎉
                      </p>
                    </motion.div>
                  )}

                  {/* Error Message */}
                  {errorMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200"
                    >
                      <p className="text-sm font-medium text-red-800">
                        Transaction Failed
                      </p>
                      <p className="text-xs text-red-600 mt-1">{errorMessage}</p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

