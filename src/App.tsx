import { useState } from 'react';
import { RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './config/wagmi';
import BridgeModal from './components/BridgeModal';
import LandingPage from './components/LandingPage';
import Navigation, { TabType } from './components/Navigation';
import Swap from './components/Swap';
import Pools from './components/Pools';
import CreatePool from './components/CreatePool';
import MaintenancePage from './components/MaintenancePage';
import XFollowFAB from './components/XFollowFAB';
import { ArrowLeftRight, Home } from 'lucide-react';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

// MAINTENANCE MODE: Controlled by environment variable VITE_MAINTENANCE_MODE
// Set to "true" in .env to enable maintenance page, "false" or omit to go live
const MAINTENANCE_MODE = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

function AppContent() {
  // Show maintenance page if maintenance mode is enabled
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />;
  }

  const { address, isConnected } = useAccount();
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('bridge');
  const [showLandingPage, setShowLandingPage] = useState(true);

  return (
    <>
      {showLandingPage ? (
        <LandingPage onGetStarted={() => setShowLandingPage(false)} />
      ) : (
        <div className="min-h-screen bg-orange-50 flex items-start justify-center p-3 sm:p-4 md:p-8">
          <div className="w-full max-w-5xl mt-4 sm:mt-6 md:mt-8">
            {/* Header with Wallet Connect */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 md:mb-8 gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowLandingPage(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
                  title="Back to Home"
                >
                  <Home className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700 hidden sm:inline">Home</span>
                </button>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                    DeFi On ARC
                  </h1>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Bridge, Swap, and Manage Liquidity
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl p-2 border border-gray-200 shadow-lg self-start md:self-auto">
              <ConnectButton
                showBalance={true}
                chainStatus="icon"
                accountStatus={{
                  smallScreen: 'avatar',
                  largeScreen: 'full',
                }}
              />
              </div>
            </div>

            {/* Navigation Tabs */}
            <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Content Area */}
            <div className="mt-6">
              {activeTab === 'bridge' && (
                <BridgeModal asPage={true} />
              )}

              {activeTab === 'swap' && <Swap />}
              {activeTab === 'pools' && <Pools />}
              {activeTab === 'create-pool' && <CreatePool />}
            </div>
          </div>

          <BridgeModal
            isOpen={isBridgeModalOpen}
            onClose={() => setIsBridgeModalOpen(false)}
          />

          {/* X Follow FAB */}
          <XFollowFAB />
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

