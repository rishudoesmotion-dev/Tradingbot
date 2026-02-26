'use client';

import { useEffect, useState } from 'react';
import { Order, OrderStatus } from '@/types/broker.types';
import { useTradingStore } from '@/store/tradingStore';
import { X } from 'lucide-react';

export default function OrderBook() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const { orders: storeOrders, cancelOrder } = useTradingStore();

  useEffect(() => {
    setOrders(storeOrders);
  }, [storeOrders]);

  const handleCancel = async (orderId: string) => {
    try {
      setLoading(true);
      await cancelOrder(orderId);
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to cancel order:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
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
        return 'text-green-600';
      case OrderStatus.PENDING:
        return 'text-yellow-600';
      case OrderStatus.REJECTED:
        return 'text-red-600';
      case OrderStatus.CANCELLED:
        return 'text-gray-600';
      default:
        return 'text-blue-600';
    }
  };

  if (orders.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 border border-gray-200 rounded-lg">
        <p>No orders yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2 text-left">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedOrders(new Set(orders.map(o => o.orderId)));
                  } else {
                    setSelectedOrders(new Set());
                  }
                }}
              />
            </th>
            <th className="px-4 py-2 text-left">Order ID</th>
            <th className="px-4 py-2 text-left">Symbol</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2 text-right">Price</th>
            <th className="px-4 py-2 text-right">Filled</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.orderId} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={selectedOrders.has(order.orderId)}
                  onChange={() => handleSelectOrder(order.orderId)}
                />
              </td>
              <td className="px-4 py-2 font-mono text-xs">{order.orderId}</td>
              <td className="px-4 py-2 font-semibold">{order.symbol}</td>
              <td className="px-4 py-2 text-right">{order.quantity}</td>
              <td className="px-4 py-2 text-right">₹{order.price.toFixed(2)}</td>
              <td className="px-4 py-2 text-right">
                {order.filledQuantity}/{order.quantity}
              </td>
              <td className={`px-4 py-2 font-semibold ${getStatusColor(order.status)}`}>
                {order.status}
              </td>
              <td className="px-4 py-2 text-center">
                {order.status === OrderStatus.PENDING && (
                  <button
                    onClick={() => handleCancel(order.orderId)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
