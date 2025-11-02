import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'viem/chains';

// Use official Arc Testnet RPC endpoint
const ARC_RPC_URL = 'https://rpc.testnet.arc.network';

// Arc Testnet configuration
// Note: MetaMask validation requires 18 decimals for nativeCurrency
// Even though Arc Testnet uses USDC with 6 decimals, we use 18 here to satisfy MetaMask
// Actual transactions will still use the correct 6 decimals for USDC
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    decimals: 18, // MetaMask requires 18, though Arc uses USDC with 6 decimals
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://testnet.arcscan.app' },
  },
} as const;

export const config = getDefaultConfig({
  appName: 'Bridge Kit App',
  projectId: 'ed1deffe285a3c80426c7502b6b773dd', // Replace with your WalletConnect Project ID
  chains: [sepolia, arcTestnet],
});

