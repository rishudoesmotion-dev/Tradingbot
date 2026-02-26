'use client';

import { useState } from 'react';
import { OrderType, OrderSide, ProductType } from '@/types/broker.types';
import { useTradingStore } from '@/store/tradingStore';
import { AlertCircle, Loader } from 'lucide-react';

export default function QuickTrade() {
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [side, setSide] = useState<OrderSide>(OrderSide.BUY);
  const [orderType, setOrderType] = useState<OrderType>(OrderType.LIMIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { placeOrder } = useTradingStore();

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!symbol.trim()) {
      setError('Please enter a symbol');
      return;
    }

    if (quantity <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }

    if (orderType === OrderType.LIMIT && price <= 0) {
      setError('Price must be greater than 0 for limit orders');
      return;
    }

    try {
      setLoading(true);
      await placeOrder({
        symbol: symbol.toUpperCase(),
        exchange: 'NSE',
        side,
        quantity,
        orderType,
        price: orderType === OrderType.MARKET ? undefined : price,
        productType: ProductType.INTRADAY,
      });

      // Reset form
      setSymbol('');
      setQuantity(1);
      setPrice(0);
      setSide(OrderSide.BUY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Quick Trade</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="space-y-3">
        {/* Symbol Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Symbol
          </label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g., INFY"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Quantity and Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
          {orderType === OrderType.LIMIT && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                step="0.05"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          )}
        </div>

        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Order Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrderType(OrderType.MARKET)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                orderType === OrderType.MARKET
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={loading}
            >
              Market
            </button>
            <button
              type="button"
              onClick={() => setOrderType(OrderType.LIMIT)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                orderType === OrderType.LIMIT
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={loading}
            >
              Limit
            </button>
          </div>
        </div>

        {/* Buy/Sell Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="submit"
            onClick={() => setSide(OrderSide.BUY)}
            className={`px-4 py-2 rounded-md text-white font-semibold flex items-center justify-center gap-2 transition-colors ${
              side === OrderSide.BUY && !loading
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            disabled={loading || side !== OrderSide.BUY}
          >
            {loading && <Loader size={16} className="animate-spin" />}
            BUY
          </button>
          <button
            type="submit"
            onClick={() => setSide(OrderSide.SELL)}
            className={`px-4 py-2 rounded-md text-white font-semibold flex items-center justify-center gap-2 transition-colors ${
              side === OrderSide.SELL && !loading
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            disabled={loading || side !== OrderSide.SELL}
          >
            {loading && <Loader size={16} className="animate-spin" />}
            SELL
          </button>
        </div>
      </form>
    </div>
  );
}
