import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Exambro from './pages/Exambro';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Download, X } from 'lucide-react';

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  return (
    <ErrorBoundary>
      <Router>
        <div className="relative min-h-screen">
          {/* PWA Install Banner */}
          {showInstallPrompt && (
            <div className="fixed bottom-4 left-4 right-4 z-[100] bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl border border-emerald-400/30 flex items-center justify-between animate-bounce">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Pasang Aplikasi</h3>
                  <p className="text-xs opacity-90">Instal Exambro ke layar HP Anda</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleInstall}
                  className="bg-white text-emerald-700 px-4 py-2 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-transform"
                >
                  PASANG SEKARANG
                </button>
                <button 
                  onClick={() => setShowInstallPrompt(false)}
                  className="p-2 hover:bg-white/10 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <Routes>
            <Route path="/" element={<Exambro />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}
