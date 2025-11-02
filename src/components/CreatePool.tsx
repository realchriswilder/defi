import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, AlertCircle, CheckCircle2, Loader2, ArrowRight, X, ChevronDown } from 'lucide-react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, isAddress, formatUnits, type Address } from 'viem';
import { FACTORY_ABI, POOL_ABI, ERC20_ABI } from '../config/abis';
import { DEX_CONFIG } from '../config/dex';
import TokenLogo from './TokenLogo';
import { useDEX, useTokenBalance, usePoolReserves, TOKENS, type TokenSymbol, getPoolAddress } from '../hooks/useDEX';

const AVAILABLE_TOKENS: TokenSymbol[] = ['RAC', 'RACD', 'RACA', 'USDC'];

// Allowed wallet addresses for pool creation
const ALLOWED_WALLETS = [
  '0x34B5e3B8465e0A4b40b4D0819C1eB6c38E160b33',
  '0xd67F44f3CAD319fBb0308Dfb3bF2e1B31D4a93b6',
].map(addr => addr.toLowerCase());

type Step = 'select-tokens' | 'enter-amounts';

export default function CreatePool() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<Step>('select-tokens');
  const [tokenA, setTokenA] = useState(TOKENS.USDC.address); // Default to USDC
  const [tokenB, setTokenB] = useState(TOKENS.USDC.address); // Default to USDC
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showTokenSelector, setShowTokenSelector] = useState<'A' | 'B' | null>(null);
  const [customAddressA, setCustomAddressA] = useState('');
  const [customAddressB, setCustomAddressB] = useState('');
  const [tokenAInteracted, setTokenAInteracted] = useState(false);
  const [tokenBInteracted, setTokenBInteracted] = useState(false);
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  
  const isArcTestnet = chainId === 5042002;

  // Check if wallet is authorized for pool creation
  const isAuthorized = useMemo(() => {
    if (!address || !isConnected) return false;
    return ALLOWED_WALLETS.includes(address.toLowerCase());
  }, [address, isConnected]);

  const isValidA = tokenA && isAddress(tokenA);
  const isValidB = tokenB && isAddress(tokenB);

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

  // Select token from dropdown
  const selectToken = (tokenSymbol: TokenSymbol, type: 'A' | 'B') => {
    // Check authorization before proceeding
    if (isConnected && !isAuthorized) {
      setShowUnauthorizedModal(true);
      setShowTokenSelector(null);
      return;
    }

    const tokenAddress = TOKENS[tokenSymbol].address;
    if (type === 'A') {
      setTokenA(tokenAddress);
      setCustomAddressA('');
      setTokenAInteracted(true);
    } else {
      setTokenB(tokenAddress);
      setCustomAddressB('');
      setTokenBInteracted(true);
    }
    setShowTokenSelector(null);
  };

  // Fetch balances for all tokens when dropdown is open
  const { data: balanceRAC } = useReadContract({
    address: TOKENS.RAC.address as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected && isArcTestnet },
  });

  const { data: balanceRACD } = useReadContract({
    address: TOKENS.RACD.address as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected && isArcTestnet },
  });

  const { data: balanceRACA } = useReadContract({
    address: TOKENS.RACA.address as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected && isArcTestnet },
  });

  const { data: balanceUSDC } = useReadContract({
    address: TOKENS.USDC.address as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected && isArcTestnet },
  });

  // Format balances
  const getTokenBalance = (tokenSymbol: TokenSymbol): string => {
    let balance: bigint | undefined;
    switch (tokenSymbol) {
      case 'RAC':
        balance = balanceRAC;
        break;
      case 'RACD':
        balance = balanceRACD;
        break;
      case 'RACA':
        balance = balanceRACA;
        break;
      case 'USDC':
        balance = balanceUSDC;
        break;
    }
    if (!balance) return '0';
    return formatUnits(balance, TOKENS[tokenSymbol].decimals);
  };

  // Get token info for display
  const { data: symbolA } = useReadContract({
    address: isValidA ? (tokenA as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: !!isValidA },
  });

  const { data: decimalsA } = useReadContract({
    address: isValidA ? (tokenA as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!isValidA },
  });

  const { data: nameA } = useReadContract({
    address: isValidA ? (tokenA as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'name',
    query: { enabled: !!isValidA },
  });

  const { data: symbolB } = useReadContract({
    address: isValidB ? (tokenB as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: !!isValidB },
  });

  const { data: decimalsB } = useReadContract({
    address: isValidB ? (tokenB as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!isValidB },
  });

  const { data: nameB } = useReadContract({
    address: isValidB ? (tokenB as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'name',
    query: { enabled: !!isValidB },
  });

  // Check if pool exists
  const { data: existingPool } = useReadContract({
    address: DEX_CONFIG.FACTORY_ADDRESS as Address,
    abi: FACTORY_ABI,
    functionName: 'getPool',
    args: isValidA && isValidB
      ? [tokenA as Address, tokenB as Address] 
      : undefined,
    query: { enabled: !!(isValidA && isValidB) },
  });

  const poolExists = existingPool && existingPool !== '0x0000000000000000000000000000000000000000';
  
  // Get pool reserves if pool exists
  const poolReserves = usePoolReserves(
    isValidA ? (tokenA as Address) : '0x0',
    isValidB ? (tokenB as Address) : '0x0'
  );

  // Calculate current price from reserves (for existing pools)
  const currentPrice = useMemo(() => {
    if (!poolExists || !poolReserves.reserveA || !poolReserves.reserveB || parseFloat(poolReserves.reserveB) <= 0) return null;
    return parseFloat(poolReserves.reserveA) / parseFloat(poolReserves.reserveB);
  }, [poolExists, poolReserves]);

  // Auto-calculate amountB based on amountA and current price (for existing pools)
  useEffect(() => {
    if (step === 'enter-amounts' && poolExists && amountA && currentPrice && parseFloat(amountA) > 0) {
      // For existing pools, calculate B based on A and pool price
      // Price = reserveA / reserveB, so amountB = amountA / price
      const calculatedB = (parseFloat(amountA) / currentPrice).toFixed(6);
      setAmountB(calculatedB);
    } else if (!amountA && step === 'enter-amounts') {
      setAmountB('');
    }
  }, [amountA, currentPrice, poolExists, step]);

  // Calculate starting price (only for new pools)
  const startingPrice = useMemo(() => {
    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) return null;
    if (poolExists) return null; // Don't show starting price if pool already exists
    return parseFloat(amountB) / parseFloat(amountA);
  }, [amountA, amountB, poolExists]);

  // Try to match token addresses to known symbols
  const tokenASymbolKey = useMemo(() => {
    if (!isValidA) return null;
    const entry = Object.entries(TOKENS).find(
      ([_, info]) => info.address.toLowerCase() === (tokenA as string).toLowerCase()
    );
    return entry ? entry[0] : (symbolA as string);
  }, [isValidA, tokenA, symbolA]);

  const tokenBSymbolKey = useMemo(() => {
    if (!isValidB) return null;
    const entry = Object.entries(TOKENS).find(
      ([_, info]) => info.address.toLowerCase() === (tokenB as string).toLowerCase()
    );
    return entry ? entry[0] : (symbolB as string);
  }, [isValidB, tokenB, symbolB]);

  // Always read balance directly from token addresses (most reliable)
  const { data: balanceARaw } = useReadContract({
    address: (isValidA && address && isConnected && tokenA) ? (tokenA as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!(address && isConnected && isValidA && tokenA && isArcTestnet) },
  });
  
  const { data: balanceBRaw } = useReadContract({
    address: (isValidB && address && isConnected && tokenB) ? (tokenB as Address) : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!(address && isConnected && isValidB && tokenB && isArcTestnet) },
  });

  // Format balances using decimals (use contract decimals if available, otherwise default to 18)
  const balanceAFinal = useMemo(() => {
    if (!balanceARaw) return '0';
    const decimals = decimalsA ? Number(decimalsA) : 18;
    return formatUnits(balanceARaw, decimals);
  }, [balanceARaw, decimalsA]);

  const balanceBFinal = useMemo(() => {
    if (!balanceBRaw) return '0';
    const decimals = decimalsB ? Number(decimalsB) : 18;
    return formatUnits(balanceBRaw, decimals);
  }, [balanceBRaw, decimalsB]);

  const { writeContract, data: createHash, isPending: isCreating, error: writeError } = useWriteContract();
  const { isLoading: isConfirmingCreate, isSuccess: poolCreated } = useWaitForTransactionReceipt({ hash: createHash });

  const { addLiquidity, approveToken, isPending: isAddingLiquidity, isConfirming: isConfirmingLiquidity, isSuccess: transactionSuccess, error: liquidityError } = useDEX();
  
  // Approval flow state
  const [approvalStep, setApprovalStep] = useState<'none' | 'approvingA' | 'approvingB' | 'adding'>('none');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [liquiditySuccess, setLiquiditySuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleContinueToAmounts = () => {
    // Check authorization before proceeding
    if (isConnected && !isAuthorized) {
      setShowUnauthorizedModal(true);
      return;
    }
    
    setError(null);
    
    if (!isAddress(tokenA) || !isAddress(tokenB)) {
      setError('Please enter valid token addresses');
      return;
    }
    
    if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
      setError('Token addresses must be different');
      return;
    }

    setStep('enter-amounts');
  };

  const formatErrorMessage = (err: any): string => {
    if (!err) return 'Unknown error occurred';
    const errorStr = err.message || err.toString() || '';
    if (errorStr.includes('User rejected') || errorStr.includes('User denied')) {
      return 'Transaction was cancelled. Please try again when ready.';
    }
    if (errorStr.includes('allowance') || errorStr.includes('Allowance')) {
      return 'Token approval required. Please approve and try again.';
    }
    if (errorStr.includes('NEED_APPROVE')) {
      return 'Token approval required.';
    }
    return errorStr || 'An unexpected error occurred. Please try again.';
  };

  const handleCreatePool = async () => {
    // Check authorization before proceeding
    if (isConnected && !isAuthorized) {
      setShowUnauthorizedModal(true);
      return;
    }

    setError(null);
    
    if (!isAddress(tokenA) || !isAddress(tokenB)) {
      setError('Please enter valid token addresses');
      return;
    }

    if (!tokenASymbolKey || !tokenBSymbolKey) {
      setError('Unable to identify token symbols');
      return;
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      setError('Please enter valid amounts');
      return;
    }

    setShowProgressModal(true);
    setApprovalStep('none');

    try {
      // If pool doesn't exist, create it first
      if (!poolExists) {
        setApprovalStep('adding'); // Will handle pool creation
        writeContract({
          address: DEX_CONFIG.FACTORY_ADDRESS as Address,
          abi: FACTORY_ABI,
          functionName: 'createPool',
          args: [tokenA as Address, tokenB as Address],
        });
      } else {
        // Pool exists, try to add liquidity (this will throw if approvals needed)
        setApprovalStep('adding');
        await addLiquidity(
          tokenASymbolKey as TokenSymbol,
          tokenBSymbolKey as TokenSymbol,
          amountA,
          amountB
        );
      }
    } catch (err: any) {
      console.error('Create pool/add liquidity error:', err);
      const errorMsg = err.message || err.toString() || '';
      
      // Handle approval errors
      if (errorMsg.includes('NEED_APPROVE_A')) {
        setApprovalStep('approvingA');
        // Get pool address for approval - try to fetch it if not available
        const fetchPoolAddress = async () => {
          let poolAddr: Address | null = null;
          
          // Try existingPool first
          if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
            poolAddr = existingPool as Address;
          } else if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
            poolAddr = poolReserves.poolAddress;
          } else if (publicClient) {
            // Try to fetch from factory
            try {
              poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
            } catch (fetchErr) {
              console.error('Error fetching pool address:', fetchErr);
            }
          }
          
          if (poolAddr) {
            try {
              approveToken(tokenASymbolKey as TokenSymbol, poolAddr);
            } catch (approveErr: any) {
              console.error('Error approving token A:', approveErr);
              setError(formatErrorMessage(approveErr));
              setShowProgressModal(false);
              setApprovalStep('none');
            }
          } else {
            setError('Pool address not found. Please wait for pool creation to complete.');
            setShowProgressModal(false);
            setApprovalStep('none');
          }
        };
        
        fetchPoolAddress();
      } else if (errorMsg.includes('NEED_APPROVE_B')) {
        setApprovalStep('approvingB');
        // Get pool address for approval
        const fetchPoolAddress = async () => {
          let poolAddr: Address | null = null;
          
          // Try existingPool first
          if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
            poolAddr = existingPool as Address;
          } else if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
            poolAddr = poolReserves.poolAddress;
          } else if (publicClient) {
            // Try to fetch from factory
            try {
              poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
            } catch (fetchErr) {
              console.error('Error fetching pool address:', fetchErr);
            }
          }
          
          if (poolAddr) {
            try {
              approveToken(tokenBSymbolKey as TokenSymbol, poolAddr);
            } catch (approveErr: any) {
              console.error('Error approving token B:', approveErr);
              setError(formatErrorMessage(approveErr));
              setShowProgressModal(false);
              setApprovalStep('none');
            }
          } else {
            setError('Pool address not found. Please wait for pool creation to complete.');
            setShowProgressModal(false);
            setApprovalStep('none');
          }
        };
        
        fetchPoolAddress();
      } else {
        const formattedError = formatErrorMessage(err);
        setError(formattedError);
        setErrorMessage(formattedError);
        setShowProgressModal(false);
        setApprovalStep('none');
      }
    }
  };

  // Track transaction progress
  useEffect(() => {
    if (isAddingLiquidity || isConfirmingLiquidity || isCreating || isConfirmingCreate) {
      if (!showProgressModal) {
        setShowProgressModal(true);
      }
    } else if (transactionSuccess && approvalStep === 'adding') {
      // Only show success for liquidity addition, not for approvals
      setLiquiditySuccess(true);
      setTimeout(() => {
        setShowProgressModal(false);
        setApprovalStep('none');
        setLiquiditySuccess(false);
        setAmountA('');
        setAmountB('');
        setCompletedApprovalStep('none');
      }, 2500);
    } else if (liquidityError || writeError) {
      const errorMsg = liquidityError?.message || writeError?.message || '';
      if (errorMsg.includes('NEED_APPROVE')) {
        // Will be handled in handleCreatePool catch block or auto-proceed logic
        return;
      }
      // Only show error for liquidity addition errors, not approval errors
      if (approvalStep === 'adding') {
        setError(formatErrorMessage(liquidityError || writeError));
        setErrorMessage(formatErrorMessage(liquidityError || writeError));
        setTimeout(() => {
          setShowProgressModal(false);
          setApprovalStep('none');
        }, 3000);
      }
    }
  }, [isAddingLiquidity, isConfirmingLiquidity, isCreating, isConfirmingCreate, transactionSuccess, liquidityError, writeError, approvalStep, showProgressModal]);

  // Track which approval just completed to prevent duplicate triggers
  const [completedApprovalStep, setCompletedApprovalStep] = useState<'none' | 'approvingA' | 'approvingB'>('none');

  // Auto-proceed after approval completes
  useEffect(() => {
    // Only proceed when approval transaction succeeds and we haven't already processed this approval
    if (transactionSuccess && !isAddingLiquidity && !isConfirmingLiquidity && (approvalStep === 'approvingA' || approvalStep === 'approvingB') && completedApprovalStep !== approvalStep) {
      const proceed = async () => {
        try {
          // Mark this approval as completed
          setCompletedApprovalStep(approvalStep);
          
          // Ensure modal stays open
          if (!showProgressModal) {
            setShowProgressModal(true);
          }
          
          // Wait a bit for the blockchain to update
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Get pool address
          let poolAddr: Address | null = null;
          if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
            poolAddr = poolReserves.poolAddress;
          } else if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
            poolAddr = existingPool as Address;
          } else if (publicClient) {
            poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
          }
          
          if (!poolAddr || !publicClient || !address) {
            throw new Error('Pool address not found or client not available');
          }

          const tokenAInfo = TOKENS[tokenASymbolKey as TokenSymbol];
          const tokenBInfo = TOKENS[tokenBSymbolKey as TokenSymbol];
          const amountAWei = parseUnits(amountA, tokenAInfo.decimals);
          const amountBWei = parseUnits(amountB, tokenBInfo.decimals);

          // Check current allowances again
          const [allowanceA, allowanceB] = await Promise.all([
            publicClient.readContract({
              address: tokenAInfo.address,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [address, poolAddr],
            }),
            publicClient.readContract({
              address: tokenBInfo.address,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [address, poolAddr],
            }),
          ]);

          if (approvalStep === 'approvingA') {
            // Token A should be approved now, check if B also needs approval
            if (allowanceB < amountBWei) {
              // Still need to approve Token B
              setApprovalStep('approvingB');
              setCompletedApprovalStep('none'); // Reset to allow next approval
              approveToken(tokenBSymbolKey as TokenSymbol, poolAddr);
            } else {
              // Both approved, proceed to add liquidity
              setApprovalStep('adding');
              setCompletedApprovalStep('none'); // Reset
              await addLiquidity(
                tokenASymbolKey as TokenSymbol,
                tokenBSymbolKey as TokenSymbol,
                amountA,
                amountB
              );
            }
          } else if (approvalStep === 'approvingB') {
            // Token B should be approved now, check if A is also approved
            if (allowanceA < amountAWei) {
              // This shouldn't happen, but handle it
              setApprovalStep('approvingA');
              setCompletedApprovalStep('none'); // Reset to allow next approval
              approveToken(tokenASymbolKey as TokenSymbol, poolAddr);
            } else {
              // Both approved, proceed to add liquidity
              setApprovalStep('adding');
              setCompletedApprovalStep('none'); // Reset
              await addLiquidity(
                tokenASymbolKey as TokenSymbol,
                tokenBSymbolKey as TokenSymbol,
                amountA,
                amountB
              );
            }
          }
        } catch (err: any) {
          console.error('Error proceeding after approval:', err);
          const errorMsg = err?.message || err?.toString() || '';
          
          // Handle approval errors that might occur during auto-proceed
          if (errorMsg.includes('NEED_APPROVE_A')) {
            const poolAddr = poolReserves.poolAddress || existingPool;
            if (poolAddr) {
              setApprovalStep('approvingA');
              setCompletedApprovalStep('none');
              approveToken(tokenASymbolKey as TokenSymbol, poolAddr as Address);
            }
          } else if (errorMsg.includes('NEED_APPROVE_B')) {
            const poolAddr = poolReserves.poolAddress || existingPool;
            if (poolAddr) {
              setApprovalStep('approvingB');
              setCompletedApprovalStep('none');
              approveToken(tokenBSymbolKey as TokenSymbol, poolAddr as Address);
            }
          } else {
            setError(formatErrorMessage(err));
            setErrorMessage(formatErrorMessage(err));
            // Don't close modal on error, let user see what went wrong
          }
        }
      };
      proceed();
    }
  }, [transactionSuccess, approvalStep, poolReserves.poolAddress, tokenASymbolKey, tokenBSymbolKey, amountA, amountB, addLiquidity, approveToken, isAddingLiquidity, isConfirmingLiquidity, completedApprovalStep, showProgressModal, existingPool, publicClient, tokenA, tokenB, address, getPoolAddress]);

  // Auto-add liquidity after pool is created
  useEffect(() => {
    if (poolCreated && !poolExists && amountA && amountB && parseFloat(amountA) > 0 && parseFloat(amountB) > 0 && tokenASymbolKey && tokenBSymbolKey && showProgressModal && publicClient) {
      // Wait a bit for pool to be ready, then try to add liquidity
      setTimeout(async () => {
        try {
          // Fetch pool address directly from factory since reactive state might not be updated yet
          let poolAddr: Address | null = null;
          
          // Try to get pool address
          if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
            poolAddr = poolReserves.poolAddress;
          } else if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
            poolAddr = existingPool as Address;
          } else {
            // Fetch directly from factory
            poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
          }
          
          if (!poolAddr) {
            console.error('Pool address not found after creation');
            setError('Pool address not found. Please try adding liquidity manually.');
            setShowProgressModal(false);
            setApprovalStep('none');
            return;
          }
          
          setApprovalStep('adding');
          await addLiquidity(
            tokenASymbolKey as TokenSymbol,
            tokenBSymbolKey as TokenSymbol,
            amountA,
            amountB
          );
        } catch (err: any) {
          console.error('Error adding liquidity after pool creation:', err);
          const errorMsg = err.message || err.toString() || '';
          if (errorMsg.includes('NEED_APPROVE_A')) {
            // Fetch pool address if not available
            let poolAddr: Address | null = null;
            if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
              poolAddr = poolReserves.poolAddress;
            } else if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
              poolAddr = existingPool as Address;
            } else if (publicClient) {
              poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
            }
            
            if (poolAddr) {
              setApprovalStep('approvingA');
              approveToken(tokenASymbolKey as TokenSymbol, poolAddr);
            } else {
              setError('Pool address not found. Please try adding liquidity manually.');
              setShowProgressModal(false);
              setApprovalStep('none');
            }
          } else if (errorMsg.includes('NEED_APPROVE_B')) {
            // Fetch pool address if not available
            let poolAddr: Address | null = null;
            if (poolReserves.poolAddress && poolReserves.poolAddress !== '0x0000000000000000000000000000000000000000') {
              poolAddr = poolReserves.poolAddress;
            } else if (existingPool && existingPool !== '0x0000000000000000000000000000000000000000') {
              poolAddr = existingPool as Address;
            } else if (publicClient) {
              poolAddr = await getPoolAddress(tokenA as Address, tokenB as Address, publicClient);
            }
            
            if (poolAddr) {
              setApprovalStep('approvingB');
              approveToken(tokenBSymbolKey as TokenSymbol, poolAddr);
            } else {
              setError('Pool address not found. Please try adding liquidity manually.');
              setShowProgressModal(false);
              setApprovalStep('none');
            }
          } else {
            setError(formatErrorMessage(err));
            setShowProgressModal(false);
            setApprovalStep('none');
          }
        }
      }, 3000); // Increased delay to ensure pool is fully ready
    }
  }, [poolCreated, poolExists, amountA, amountB, tokenASymbolKey, tokenBSymbolKey, addLiquidity, approveToken, showProgressModal, poolReserves.poolAddress, existingPool, publicClient, tokenA, tokenB, getPoolAddress]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <motion.div
        className="bg-white rounded-2xl p-4 sm:p-6 border border-orange-200 shadow-xl relative"
        style={{
          boxShadow: `
            0 0 20px rgba(251, 146, 60, 0.15),
            0 0 40px rgba(251, 146, 60, 0.1),
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.9)
          `
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">New position</h2>
        </div>

        {/* Steps Indicator */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-sm sm:text-base relative z-10 ${
                step === 'select-tokens' ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                1
              </div>
              <div className={`text-xs sm:text-sm font-medium ${step === 'select-tokens' ? 'text-orange-600' : 'text-gray-600'}`}>
                Select token pair
              </div>
            </div>

            {/* Connecting Line */}
            <div className="flex-1 mx-4 h-0.5 sm:h-1 relative">
              {/* Gray Background Line */}
              <div className="absolute inset-0 bg-gray-300 rounded-full" />
              {/* Orange Fill Line (fills when step 2 is active) */}
              <motion.div
                className="absolute inset-0 bg-orange-500 rounded-full origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: step === 'enter-amounts' ? 1 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              />
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-sm sm:text-base relative z-10 ${
                step === 'enter-amounts' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                2
              </div>
              <div className={`text-xs sm:text-sm font-medium ${step === 'enter-amounts' ? 'text-orange-600' : 'text-gray-500'}`}>
                Enter deposit amounts
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Select Tokens */}
        {step === 'select-tokens' && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Info Note */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  <span className="font-semibold">Note:</span> Only USDC pair pools are allowed. One of the tokens must be USDC.
                </p>
              </div>
            </div>

            {/* Token A and B on same line */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Token A */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token A
                </label>
                <div className="space-y-2">
                  {/* Token Selector Button */}
                  <div className="relative">
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTokenSelector(showTokenSelector === 'A' ? null : 'A');
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 transition-all"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center gap-2">
                        {tokenA && isValidA && (
                          <TokenLogo token={symbolA as string || '?'} size={24} className="flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          {tokenA && isValidA && symbolA ? symbolA : 'Select token'}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    </motion.button>
                    <AnimatePresence>
                      {showTokenSelector === 'A' && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-2xl z-50 max-h-[300px] overflow-y-auto scrollbar-hide"
                        >
                          {AVAILABLE_TOKENS.map((tokenSymbol) => {
                            const balance = getTokenBalance(tokenSymbol);
                            return (
                              <motion.button
                                key={tokenSymbol}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectToken(tokenSymbol, 'A');
                                }}
                                whileHover={{ scale: 1.02, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl ${
                                  tokenA === TOKENS[tokenSymbol].address ? 'bg-orange-50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <TokenLogo token={tokenSymbol} size={32} className="flex-shrink-0" />
                                  <span className="font-semibold text-gray-900">{tokenSymbol}</span>
                                </div>
                                {address && isConnected && (
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {balance && !isNaN(parseFloat(balance)) ? parseFloat(balance).toFixed(4) : '0.0000'}
                                  </span>
                                )}
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Custom Address Input */}
                  <input
                    type="text"
                    value={customAddressA}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomAddressA(value);
                      if (isAddress(value)) {
                        // Check authorization before setting token
                        if (isConnected && !isAuthorized) {
                          setShowUnauthorizedModal(true);
                          return;
                        }
                        setTokenA(value);
                        setTokenAInteracted(true);
                        setError(null);
                      }
                    }}
                    placeholder="Or paste custom address (0x...)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                {isValidA && tokenAInteracted && (symbolA || nameA) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TokenLogo token={(symbolA as string) || '?'} size={32} className="flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{symbolA || 'Unknown'}</div>
                        {nameA && <div className="text-xs text-gray-500">{nameA}</div>}
                      </div>
                    </div>
                    {address && isConnected && (
                      <div className="text-xs text-gray-600 whitespace-nowrap">
                        Balance: {balanceAFinal && !isNaN(parseFloat(balanceAFinal)) ? parseFloat(balanceAFinal).toFixed(4) : '0'}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              </div>

              {/* Token B */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token B
                </label>
                <div className="space-y-2">
                  {/* Token Selector Button */}
                  <div className="relative">
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTokenSelector(showTokenSelector === 'B' ? null : 'B');
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 transition-all"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center gap-2">
                        {tokenB && isValidB && (
                          <TokenLogo token={symbolB as string || 'USDC'} size={24} className="flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          {tokenB && isValidB && symbolB ? symbolB : 'USDC'}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    </motion.button>
                    <AnimatePresence>
                      {showTokenSelector === 'B' && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-2xl z-50 max-h-[300px] overflow-y-auto scrollbar-hide"
                        >
                          {/* Show all tokens for Token B */}
                          {AVAILABLE_TOKENS.map((tokenSymbol) => {
                            const balance = getTokenBalance(tokenSymbol);
                            return (
                              <motion.button
                                key={tokenSymbol}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectToken(tokenSymbol, 'B');
                                }}
                                whileHover={{ scale: 1.02, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl ${
                                  tokenB === TOKENS[tokenSymbol].address ? 'bg-orange-50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <TokenLogo token={tokenSymbol} size={32} className="flex-shrink-0" />
                                  <span className="font-semibold text-gray-900">{tokenSymbol}</span>
                                </div>
                                {address && isConnected && (
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {balance && !isNaN(parseFloat(balance)) ? parseFloat(balance).toFixed(4) : '0.0000'}
                                  </span>
                                )}
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Custom Address Input for Token B */}
                  <input
                    type="text"
                    value={customAddressB}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomAddressB(value);
                      if (isAddress(value)) {
                        // Check authorization before setting token
                        if (isConnected && !isAuthorized) {
                          setShowUnauthorizedModal(true);
                          return;
                        }
                        setTokenB(value);
                        setTokenBInteracted(true);
                        setError(null);
                      }
                    }}
                    placeholder="Or paste custom address (0x...)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                {isValidB && tokenBInteracted && (symbolB || nameB) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TokenLogo token={(symbolB as string) || '?'} size={32} className="flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{symbolB || 'Unknown'}</div>
                        {nameB && <div className="text-xs text-gray-500">{nameB}</div>}
                      </div>
                    </div>
                    {address && isConnected && (
                      <div className="text-xs text-gray-600 whitespace-nowrap">
                        Balance: {balanceBFinal && !isNaN(parseFloat(balanceBFinal)) ? parseFloat(balanceBFinal).toFixed(4) : '0'}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              </div>
            </div>

            {/* Pool Status */}
            {isValidA && isValidB && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-gray-50 border border-gray-200"
              >
                {poolExists ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Pool exists. You can add liquidity to it.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-700">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">Pool does not exist. It will be created when you add initial liquidity.</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Continue Button */}
            <motion.button
              onClick={handleContinueToAmounts}
              disabled={!isConnected || !isArcTestnet || !tokenA || !tokenB || !isAddress(tokenA) || !isAddress(tokenB)}
              className={`w-full py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 flex items-center justify-center gap-2 ${
                !isConnected || !isArcTestnet || !tokenA || !tokenB || !isAddress(tokenA) || !isAddress(tokenB)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600 hover:shadow-lg active:scale-95'
              }`}
              whileHover={!isConnected || !isArcTestnet || !tokenA || !tokenB || !isAddress(tokenA) || !isAddress(tokenB) ? {} : { scale: 1.02 }}
              whileTap={!isConnected || !isArcTestnet || !tokenA || !tokenB || !isAddress(tokenA) || !isAddress(tokenB) ? {} : { scale: 0.98 }}
            >
              Continue
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          </motion.div>
        )}

        {/* Step 2: Enter Amounts */}
        {step === 'enter-amounts' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3 sm:space-y-4"
          >
            {/* Current Price Display */}
            {poolExists && poolReserves.poolAddress && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-gray-600">Current price</span>
                  <span className="font-medium text-gray-900">
                    {poolReserves.reserveA && poolReserves.reserveB && parseFloat(poolReserves.reserveB) > 0
                      ? `${(parseFloat(poolReserves.reserveA) / parseFloat(poolReserves.reserveB)).toFixed(6)} ${symbolA}/${symbolB}`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            )}

            {/* Starting Price Display (only for new pools) */}
            {!poolExists && startingPrice && (
              <div className="p-3 sm:p-4 bg-orange-50 rounded-xl border border-orange-200">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs sm:text-sm font-medium text-orange-900">Starting price</span>
                  <span className="text-xs sm:text-sm font-bold text-orange-900">
                    1 {symbolA} = {startingPrice.toFixed(6)} {symbolB}
                  </span>
                </div>
                <p className="text-xs text-orange-700 mt-1">
                  This ratio will become the initial trading price for the pool.
                </p>
              </div>
            )}

            {/* Amount Inputs - Side by side on larger screens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Amount A */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                  {symbolA || 'Token A'} Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                    placeholder="0.0"
                    step="any"
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 pr-20 sm:pr-24 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
                    <TokenLogo token={(symbolA as string) || '?'} size={20} className="sm:w-6 sm:h-6" />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">{symbolA || 'A'}</span>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-gray-500 whitespace-nowrap">
                  Balance: {balanceAFinal && !isNaN(parseFloat(balanceAFinal)) ? parseFloat(balanceAFinal).toFixed(4) : '0'} {symbolA || ''}
                </div>
              </div>

              {/* Amount B */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                  {symbolB || 'Token B'} Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                    placeholder="0.0"
                    step="any"
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 pr-20 sm:pr-24 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
                    <TokenLogo token={(symbolB as string) || '?'} size={20} className="sm:w-6 sm:h-6" />
                    <span className="text-xs sm:text-sm font-medium text-gray-700">{symbolB || 'B'}</span>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-gray-500 whitespace-nowrap">
                  Balance: {balanceBFinal && !isNaN(parseFloat(balanceBFinal)) ? parseFloat(balanceBFinal).toFixed(4) : '0'} {symbolB || ''}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 pt-2">
              <motion.button
                onClick={() => setStep('select-tokens')}
                className="flex-1 py-2.5 sm:py-3 rounded-xl font-medium text-sm sm:text-base text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Back
              </motion.button>
              <motion.button
                onClick={handleCreatePool}
                disabled={
                  !isConnected ||
                  !isArcTestnet ||
                  !amountA ||
                  !amountB ||
                  parseFloat(amountA) <= 0 ||
                  parseFloat(amountB) <= 0 ||
                  isCreating ||
                  isConfirmingCreate ||
                  isAddingLiquidity ||
                  isConfirmingLiquidity
                }
                className={`flex-1 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
                  !isConnected ||
                  !isArcTestnet ||
                  !amountA ||
                  !amountB ||
                  parseFloat(amountA) <= 0 ||
                  parseFloat(amountB) <= 0 ||
                  isCreating ||
                  isConfirmingCreate ||
                  isAddingLiquidity ||
                  isConfirmingLiquidity
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
                whileHover={
                  !isConnected ||
                  !isArcTestnet ||
                  !amountA ||
                  !amountB ||
                  parseFloat(amountA) <= 0 ||
                  parseFloat(amountB) <= 0 ||
                  isCreating ||
                  isConfirmingCreate ||
                  isAddingLiquidity ||
                  isConfirmingLiquidity
                    ? {}
                    : { scale: 1.02 }
                }
                whileTap={
                  !isConnected ||
                  !isArcTestnet ||
                  !amountA ||
                  !amountB ||
                  parseFloat(amountA) <= 0 ||
                  parseFloat(amountB) <= 0 ||
                  isCreating ||
                  isConfirmingCreate ||
                  isAddingLiquidity ||
                  isConfirmingLiquidity
                    ? {}
                    : { scale: 0.98 }
                }
              >
                {(isCreating || isConfirmingCreate || isAddingLiquidity || isConfirmingLiquidity) && (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                )}
                <span className="hidden sm:inline">
                  {poolExists
                    ? isAddingLiquidity || isConfirmingLiquidity
                      ? 'Adding Liquidity...'
                      : 'Add Liquidity'
                    : isCreating || isConfirmingCreate
                    ? 'Creating Pool...'
                    : liquiditySuccess
                    ? 'Completed!'
                    : 'Create Pool & Add Liquidity'}
                </span>
                <span className="sm:hidden">
                  {poolExists
                    ? isAddingLiquidity || isConfirmingLiquidity
                      ? 'Adding...'
                      : 'Add'
                    : isCreating || isConfirmingCreate
                    ? 'Creating...'
                    : liquiditySuccess
                    ? 'Done!'
                    : 'Create'}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Error Message */}
        {(error || writeError) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Error</p>
              <p className="text-xs mt-1">{error || writeError?.message || 'Unknown error'}</p>
            </div>
          </motion.div>
        )}

        {/* Success Message */}
        {liquiditySuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-green-50 rounded-xl border border-green-200 flex items-start gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Success!</p>
              <p className="text-xs mt-1">
                {poolExists ? 'Liquidity added successfully!' : 'Pool created and liquidity added successfully!'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Progress Modal */}
        <AnimatePresence>
          {showProgressModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
              onClick={(e) => {
                e.stopPropagation();
                // Don't close modal if transaction is in progress
                if (!isAddingLiquidity && !isConfirmingLiquidity && !isCreating && !isConfirmingCreate && approvalStep === 'none') {
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
                <div className="flex items-center justify-end mb-6">
                  {!isAddingLiquidity && !isConfirmingLiquidity && !isCreating && !isConfirmingCreate && approvalStep === 'none' && (
                    <button
                      onClick={() => setShowProgressModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Step 1: Create Pool (if creating new pool) */}
                  {!poolExists && (isCreating || isConfirmingCreate || poolCreated || approvalStep !== 'none') && (
                    <div className="flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        isCreating || isConfirmingCreate
                          ? 'bg-orange-500 text-white'
                          : poolCreated
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {(isCreating || isConfirmingCreate) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : poolCreated ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          isCreating || isConfirmingCreate
                            ? 'text-orange-600'
                            : poolCreated
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}>
                          Create Pool
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {(isCreating || isConfirmingCreate) 
                            ? 'Confirm in wallet...' 
                            : poolCreated
                            ? 'Completed'
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Approve Token A */}
                  {(approvalStep === 'approvingA' || approvalStep === 'approvingB' || approvalStep === 'adding') && (
                    <div className="flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        approvalStep === 'approvingA' && (isAddingLiquidity || isConfirmingLiquidity)
                          ? 'bg-orange-500 text-white'
                          : approvalStep !== 'approvingA'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {approvalStep === 'approvingA' && (isAddingLiquidity || isConfirmingLiquidity) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : approvalStep !== 'approvingA' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          approvalStep === 'approvingA' && (isAddingLiquidity || isConfirmingLiquidity)
                            ? 'text-orange-600'
                            : approvalStep !== 'approvingA'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}>
                          Approve {symbolA || 'Token A'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {approvalStep === 'approvingA' && (isAddingLiquidity || isConfirmingLiquidity) 
                            ? 'Confirm in wallet...' 
                            : approvalStep !== 'approvingA'
                            ? 'Completed'
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Approve Token B */}
                  {(approvalStep === 'approvingB' || approvalStep === 'adding') && (
                    <div className="flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        approvalStep === 'approvingB' && (isAddingLiquidity || isConfirmingLiquidity || isCreating || isConfirmingCreate)
                          ? 'bg-orange-500 text-white'
                          : approvalStep === 'adding'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {approvalStep === 'approvingB' && (isAddingLiquidity || isConfirmingLiquidity || isCreating || isConfirmingCreate) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : approvalStep === 'adding' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          approvalStep === 'approvingB' && (isAddingLiquidity || isConfirmingLiquidity || isCreating || isConfirmingCreate)
                            ? 'text-orange-600'
                            : approvalStep === 'adding'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}>
                          Approve {symbolB || 'Token B'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {approvalStep === 'approvingB' && (isAddingLiquidity || isConfirmingLiquidity || isCreating || isConfirmingCreate) 
                            ? 'Confirm in wallet...' 
                            : approvalStep === 'adding'
                            ? 'Completed'
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Add Liquidity */}
                  {(approvalStep === 'adding' || (approvalStep !== 'none' && (isAddingLiquidity || isConfirmingLiquidity || transactionSuccess))) && (
                    <div className="flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        approvalStep === 'adding' && (isAddingLiquidity || isConfirmingLiquidity)
                          ? 'bg-orange-500 text-white'
                          : transactionSuccess && approvalStep === 'adding'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {approvalStep === 'adding' && (isAddingLiquidity || isConfirmingLiquidity) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : transactionSuccess && approvalStep === 'adding' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          approvalStep === 'adding' && (isAddingLiquidity || isConfirmingLiquidity)
                            ? 'text-orange-600'
                            : transactionSuccess && approvalStep === 'adding'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}>
                          Add Liquidity
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {approvalStep === 'adding' && (isAddingLiquidity || isConfirmingLiquidity) 
                            ? 'Confirm in wallet...' 
                            : transactionSuccess && approvalStep === 'adding'
                            ? 'Success'
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Success Message */}
                  {liquiditySuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200"
                    >
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-medium text-green-800">
                          {poolExists ? 'Liquidity added successfully' : 'Pool created and liquidity added successfully'}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Error Message */}
                  {errorMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200"
                    >
                      <div className="flex items-center gap-2 justify-center">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <p className="text-sm font-medium text-red-800">
                          {errorMessage}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unauthorized Wallet Modal */}
        <AnimatePresence>
          {showUnauthorizedModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => setShowUnauthorizedModal(false)}
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
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-orange-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Pool Creation Restricted</h3>
                  </div>
                  <button
                    onClick={() => setShowUnauthorizedModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Pool creation is currently restricted to admin wallets to avoid unnecessary pools.
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 text-center">
                    If you need to create a pool, please contact the owner on{' '}
                    <a
                      href="https://x.com/realchriswilder"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:text-orange-700 font-semibold underline"
                    >
                      X
                    </a>
                  </p>

                  <motion.button
                    onClick={() => setShowUnauthorizedModal(false)}
                    className="w-full py-3 rounded-xl font-semibold text-base bg-orange-500 text-white hover:bg-orange-600 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Understood
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
