'use client';

import { useEffect, useState } from 'react';
import { Order, OrderStatus, OrderSide } from '@/types/broker.types';
import { useTradingStore } from '@/store/tradingStore';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

export default function OrderBook() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const { orders: storeOrders, cancelOrder } = useTradingStore();

  useEffect(() => {
    setOrders(storeOrders);
  }, [storeOrders]);

  const handleCancel = async (orderId: string) => {
    try {
      setLoading(true);
      await cancelOrder(orderId);
    } catch (error) {
      console.error('Failed to cancel order:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.COMPLETE:
        return 'text-green-600 bg-green-50';
      case OrderStatus.PENDING:
        return 'text-yellow-600 bg-yellow-50';
      case OrderStatus.REJECTED:
        return 'text-red-600 bg-red-50';
      case OrderStatus.CANCELLED:
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  const getSideBadgeColor = (side: OrderSide) => {
    return side === OrderSide.BUY ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';
  };

  const formatOrderType = (orderType: string) => {
    const map: Record<string, string> = {
      'MKT': 'MARKET',
      'L': 'LIMIT',
      'SL': 'STOP LOSS',
      'SL-M': 'SL-MARKET'
    };
    return map[orderType] || orderType;
  };

  const formatProductType = (prod: string) => {
    const map: Record<string, string> = {
      'CNC': 'CNC',
      'MIS': 'MIS',
      'NRML': 'NRML'
    };
    return map[prod] || prod;
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    });
  };

  if (orders.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 border border-gray-200 rounded-lg">
        <p>No orders yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map(order => (
        <div
          key={order.orderId}
          className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition"
        >
          {/* Compact Header */}
          <div
            onClick={() => toggleExpanded(order.orderId)}
            className="bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-4 flex-1">
              {/* Date & Time */}
              <div className="min-w-fit">
                <div className="text-xs text-gray-600">{formatDate(order.timestamp)}</div>
                <div className="text-sm font-semibold text-gray-900">
                  {formatTime(order.timestamp)}
                </div>
              </div>

              {/* Symbol & Side */}
              <div className="min-w-fit">
                <div className="text-lg font-bold text-gray-900">{order.symbol}</div>
                <div className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getSideBadgeColor(order.side)}`}>
                  {order.side === OrderSide.BUY ? 'BUY' : 'SELL'} {order.quantity}/1 Shares
                </div>
              </div>

              {/* Order Type & Product */}
              <div className="min-w-fit">
                <div className="text-xs text-gray-600">{formatOrderType(order.orderType)} - {formatProductType(order.productType)}</div>
                <div className="font-semibold text-gray-900">
                  AVG {order.averagePrice > 0 ? order.averagePrice.toFixed(2) : order.price.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Status & Action */}
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded font-semibold text-sm ${getStatusColor(order.status)}`}>
                {order.status.toUpperCase()}
              </div>

              {order.status === OrderStatus.PENDING && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel(order.orderId);
                  }}
                  disabled={loading}
                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50"
                  title="Cancel order"
                >
                  <X size={18} />
                </button>
              )}

              <button
                onClick={() => toggleExpanded(order.orderId)}
                className="p-2 text-gray-600 hover:bg-gray-200 rounded"
              >
                {expandedOrders.has(order.orderId) ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedOrders.has(order.orderId) && (
            <div className="bg-white px-4 py-3 border-t border-gray-200 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Order ID</div>
                <div className="font-mono text-xs text-gray-900 mt-1">{order.orderId}</div>
              </div>

              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Exchange</div>
                <div className="text-gray-900 font-semibold mt-1">{order.exchange}</div>
              </div>

              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Order Quantity</div>
                <div className="text-gray-900 font-semibold mt-1">{order.quantity}</div>
              </div>

              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Filled Quantity</div>
                <div className="text-gray-900 font-semibold mt-1">{order.filledQuantity}</div>
              </div>

              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Price</div>
                <div className="text-gray-900 font-semibold mt-1">
                  ₹{order.price > 0 ? order.price.toFixed(2) : 'Market'}
                </div>
              </div>

              <div>
                <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Average Price</div>
                <div className="text-green-600 font-semibold mt-1">₹{order.averagePrice.toFixed(2)}</div>
              </div>

              {order.message && (
                <div className="col-span-2">
                  <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Message</div>
                  <div className="text-red-600 font-semibold mt-1">{order.message}</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
