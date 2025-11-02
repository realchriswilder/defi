// Track if a request is in progress to prevent duplicates
let isAddingChain = false;

/**
 * Add Arc Testnet to MetaMask wallet
 * This function prompts the user to add Arc Testnet to their wallet
 */
export async function addArcTestnetToWallet(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask not found. Please install MetaMask.');
  }

  // Prevent duplicate requests
  if (isAddingChain) {
    throw new Error('A request to add Arc Testnet is already in progress. Please wait and check MetaMask.');
  }

  const ethereum = (window as any).ethereum;
  // Use official Arc Testnet RPC endpoint
  const RPC_URL = 'https://rpc.testnet.arc.network';

  try {
    isAddingChain = true;
    
    // First, try to switch to the chain (in case it's already added)
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x4CEF52' }],
      });
      // If switch succeeds, we're done
      isAddingChain = false;
      return;
    } catch (switchError: any) {
      // If switch fails with 4902, chain is not added - proceed to add it
      if (switchError.code !== 4902) {
        isAddingChain = false;
        throw switchError;
      }
      // Continue to add the chain
    }
    
    // Chain is not added, so add it now
    // MetaMask validation requires 18 decimals for nativeCurrency
    // Note: Arc Testnet actually uses USDC with 6 decimals, but MetaMask's validation requires 18
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x4CEF52', // 5042002 in hex (verified: 5042002 = 0x4CEF52)
          chainName: 'Arc Testnet',
          nativeCurrency: {
            name: 'USDC',
            symbol: 'USDC',
            decimals: 18, // Must be 18 for MetaMask validation
          },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        },
      ],
    });
    
    // After adding, MetaMask should automatically switch
    // Reset flag after a delay to allow MetaMask to process
    setTimeout(() => {
      isAddingChain = false;
    }, 2000);
    
  } catch (error: any) {
    isAddingChain = false;
    
    // User rejected the request
    if (error.code === 4001) {
      throw new Error('User rejected adding Arc Testnet to wallet.');
    }
    // Request already pending - another request is in progress
    if (error.code === -32002 || error.message?.includes('already pending')) {
      throw new Error('A request to add Arc Testnet is already in progress. Please check MetaMask and wait for it to complete.');
    }
    // Chain already added - try to switch to it
    if (error.code === 4902 || error.message?.includes('Unrecognized chain')) {
      // Try to switch anyway (might be processing)
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x4CEF52' }],
        });
      } catch (switchError: any) {
        throw new Error('Failed to switch to Arc Testnet. Please switch manually in MetaMask.');
      }
      return;
    }
    // Other error (like decimals validation)
    if (error.message?.includes('Expected the number 18')) {
      throw new Error('MetaMask configuration error. Please add Arc Testnet manually in MetaMask settings.');
    }
    // Other error
    throw error;
  }
}

