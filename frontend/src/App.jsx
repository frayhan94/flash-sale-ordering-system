import { useState, useEffect, useCallback } from 'react';
import { getSaleStatus, purchase, checkPurchase } from './api';

const STATUS_COLORS = {
  UPCOMING: 'bg-blue-500',
  ACTIVE: 'bg-green-500',
  ENDED: 'bg-gray-500',
  NOT_FOUND: 'bg-red-500',
};

const RESULT_MESSAGES = {
  SUCCESS: { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  ALREADY_PURCHASED: { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  SOLD_OUT: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  SALE_NOT_ACTIVE: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  ERROR: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

function formatTime(dateString) {
  return new Date(dateString).toLocaleString();
}

function App() {
  const [saleStatus, setSaleStatus] = useState(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState(null);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getSaleStatus();
      setSaleStatus(status);
      setError(null);
    } catch (err) {
      setError('Failed to connect to server. Make sure backend is running.');
      console.error('Error fetching status:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (!saleStatus || saleStatus.status !== 'UPCOMING') {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const start = new Date(saleStatus.startTime);
      const diff = start - now;

      if (diff <= 0) {
        setCountdown(null);
        fetchStatus();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [saleStatus, fetchStatus]);

  const handlePurchase = async (e) => {
    e.preventDefault();
    if (!userId.trim()) {
      setPurchaseResult({ result: 'ERROR', message: 'Please enter a User ID' });
      return;
    }

    setLoading(true);
    setPurchaseResult(null);

    try {
      const result = await purchase(userId.trim());
      setPurchaseResult(result);
      fetchStatus();
    } catch (err) {
      setPurchaseResult({ result: 'ERROR', message: 'Network error. Please try again.' });
      console.error('Purchase error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPurchase = async () => {
    if (!userId.trim()) return;

    try {
      const result = await checkPurchase(userId.trim());
      if (result.purchased) {
        setPurchaseResult({
          result: 'ALREADY_PURCHASED',
          message: `You already purchased at ${formatTime(result.order.createdAt)}`,
        });
      } else {
        setPurchaseResult({
          result: 'INFO',
          message: 'You have not purchased yet.',
        });
      }
    } catch (err) {
      console.error('Check purchase error:', err);
    }
  };

  const stockPercentage = saleStatus
    ? (saleStatus.remainingStock / saleStatus.totalStock) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gradient mb-2">
            ⚡ FLASH SALE
          </h1>
          <p className="text-gray-400">Limited Stock - One Per Customer</p>
        </header>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6 text-red-200">
            {error}
          </div>
        )}

        {saleStatus && (
          <div className="bg-gray-800/80 backdrop-blur rounded-2xl shadow-2xl p-6 mb-6 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">{saleStatus.name || 'Flash Sale'}</h2>
                <p className="text-gray-400 text-sm">Sale ID: {saleStatus.saleId}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-white font-semibold ${STATUS_COLORS[saleStatus.status]}`}>
                {saleStatus.status}
              </span>
            </div>

            {countdown && (
              <div className="text-center mb-6 p-4 bg-blue-900/50 rounded-lg border border-blue-500">
                <p className="text-blue-300 text-sm mb-1">Sale starts in</p>
                <p className="text-3xl font-mono font-bold text-white">{countdown}</p>
              </div>
            )}

            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Stock Remaining</span>
                <span className="text-white font-bold">
                  {saleStatus.remainingStock} / {saleStatus.totalStock}
                </span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    stockPercentage > 50
                      ? 'bg-green-500'
                      : stockPercentage > 20
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${stockPercentage}%` }}
                />
              </div>
              {saleStatus.remainingStock === 0 && (
                <p className="text-red-400 text-center mt-2 font-semibold animate-pulse">
                  SOLD OUT!
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-400">Start Time</p>
                <p className="text-white font-medium">{formatTime(saleStatus.startTime)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-400">End Time</p>
                <p className="text-white font-medium">{formatTime(saleStatus.endTime)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-800/80 backdrop-blur rounded-2xl shadow-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Make a Purchase</h3>

          <form onSubmit={handlePurchase} className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-gray-400 text-sm mb-2">
                User ID
              </label>
              <input
                type="text"
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your user ID (e.g., john123)"
                className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                disabled={loading}
              />
              <p className="text-gray-500 text-xs mt-1">
                Only letters, numbers, underscores, and hyphens allowed
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || !saleStatus || saleStatus.status !== 'ACTIVE' || saleStatus.remainingStock === 0}
                className="flex-1 py-3 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  '🛒 BUY NOW'
                )}
              </button>

              <button
                type="button"
                onClick={handleCheckPurchase}
                disabled={!userId.trim()}
                className="py-3 px-4 rounded-lg font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Check Status
              </button>
            </div>
          </form>

          {purchaseResult && (
            <div
              className={`mt-4 p-4 rounded-lg border ${
                RESULT_MESSAGES[purchaseResult.result]?.bg || 'bg-gray-700'
              } ${RESULT_MESSAGES[purchaseResult.result]?.border || 'border-gray-600'}`}
            >
              <p className={`font-semibold ${RESULT_MESSAGES[purchaseResult.result]?.color || 'text-white'}`}>
                {purchaseResult.result === 'SUCCESS' && '✅ '}
                {purchaseResult.result === 'ALREADY_PURCHASED' && '⚠️ '}
                {purchaseResult.result === 'SOLD_OUT' && '❌ '}
                {purchaseResult.result === 'SALE_NOT_ACTIVE' && '⏰ '}
                {purchaseResult.result === 'ERROR' && '❗ '}
                {purchaseResult.message}
              </p>
              {purchaseResult.order && (
                <p className="text-gray-600 text-sm mt-1">
                  Order ID: {purchaseResult.order.id}
                </p>
              )}
              {purchaseResult.remainingStock !== undefined && (
                <p className="text-gray-600 text-sm mt-1">
                  Remaining stock: {purchaseResult.remainingStock}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>Flash Sale System Demo - High Concurrency with Redis + PostgreSQL</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
