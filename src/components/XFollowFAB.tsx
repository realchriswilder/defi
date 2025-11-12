import { motion } from 'framer-motion';
import { Twitter } from 'lucide-react';

export default function XFollowFAB() {
  return (
    <motion.a
      href="https://x.com/realchriswilder"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 transition-all group"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{
        boxShadow: `
          0 0 20px rgba(251, 146, 60, 0.4),
          0 4px 6px -1px rgba(0, 0, 0, 0.1),
          0 2px 4px -1px rgba(0, 0, 0, 0.06)
        `
      }}
    >
      <Twitter className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">
        Follow me on X for updates
      </span>
      <span className="text-sm font-semibold whitespace-nowrap sm:hidden">
        Follow on X
      </span>
    </motion.a>
  );
}

