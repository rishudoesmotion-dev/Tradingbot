'use client';

import { useState } from 'react';
import { RefreshCw, X, Loader2, CheckCircle, Clock, AlertCircle, Pencil } from 'lucide-react';

interface Order {
  orderId: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  averagePrice?: number;
  filledQuantity?: number;
  status: string;
  orderType?: string;
  productType?: string;
  timestamp?: Date | string;
  fillTimestamp?: Date | string;
  [key: string]: any;
}

interface OrdersTableProps {
  orders: Order[];
  isLoading: boolean;
  onCancel: (orderId: string) => Promise<void>;
  onModify: (orderId: string, newPrice: number, quantity: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const statusIcon = (status: string) => {
  const s = status?.toLowerCase();
  if (s === 'complete' || s === 'traded') return <CheckCircle size={12} className="text-green-500" />;
  if (s === 'rejected' || s === 'cancelled') return <AlertCircle size={12} className="text-red-400" />;
  return <Clock size={12} className="text-yellow-500" />;
};

const statusColor = (status: string) => {
  const s = status?.toLowerCase();
  if (s === 'complete' || s === 'traded') return 'text-green-600';
  if (s === 'rejected' || s === 'cancelled') return 'text-red-500';
  return 'text-yellow-600';
};

const isPending = (status: string) => {
  const s = status?.toLowerCase();
  return s === 'open' || s === 'pending' || s === 'trigger pending';
};

/** Format a Date or ISO string to "HH:MM:SS", returns "—" if invalid */
const formatTime = (value?: Date | string): string => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

export default function OrdersTable({ orders, isLoading, onCancel, onModify, onRefresh }: OrdersTableProps) {
  const [modifyOrder, setModifyOrder] = useState<Order | null>(null);
  const [modifyPrice, setModifyPrice] = useState('');
  const [modifyQty,   setModifyQty]   = useState('');
  const [modifying,   setModifying]   = useState(false);

  // Sort newest-first
  const sortedOrders = [...orders].sort((a, b) => {
    const getTime = (o: Order): number => {
      const ts = o.fillTimestamp || o.flTm || o.timestamp || o.ordDtTm;
      if (!ts) return 0;
      const d = ts instanceof Date ? ts : new Date(ts);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return getTime(b) - getTime(a);
  });

  // Count completed BUY and SELL orders
  const completedBuys = sortedOrders.filter(o => {
    const s = (o.status || o.ordSt || '').toLowerCase();
    const isComplete = s.includes('complete') || s === 'traded';
    const isBuy = o.side?.toUpperCase() === 'BUY' || o.trnsTp === 'B' || o.transactionType === 'B';
    return isComplete && isBuy;
  }).length;

  const completedSells = sortedOrders.filter(o => {
    const s = (o.status || o.ordSt || '').toLowerCase();
    const isComplete = s.includes('complete') || s === 'traded';
    const isBuy = o.side?.toUpperCase() === 'BUY' || o.trnsTp === 'B' || o.transactionType === 'B';
    return isComplete && !isBuy;
  }).length;

  // Resolve the real Kotak order ID from whichever field is populated
  const getOrderId = (o: Order): string =>
    o.nOrdNo || o.orderId || o.order_id || o.id || '';

  const openModify = (order: Order) => {
    const limitPrice = order.price ?? parseFloat(order.prc || '0');
    const qty = order.quantity ?? parseInt(order.qty || '0');
    setModifyOrder(order);
    setModifyPrice(limitPrice > 0 ? String(limitPrice) : '');
    setModifyQty(qty > 0 ? String(qty) : '');
  };

  const submitModify = async () => {
    if (!modifyOrder) return;
    const price = parseFloat(modifyPrice);
    const qty   = parseInt(modifyQty);
    if (isNaN(price) || price <= 0) return;
    if (isNaN(qty)   || qty   <= 0) return;
    setModifying(true);
    try {
      await onModify(getOrderId(modifyOrder), price, qty);
      setModifyOrder(null);
    } finally {
      setModifying(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Modify Order Dialog */}
      {modifyOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">Modify Order</h3>
              <button onClick={() => setModifyOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {modifyOrder.symbol || modifyOrder.trdSym} &nbsp;·&nbsp;
              <span className={(modifyOrder.side?.toUpperCase() === 'BUY' || modifyOrder.trnsTp === 'B') ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {(modifyOrder.side?.toUpperCase() === 'BUY' || modifyOrder.trnsTp === 'B') ? 'BUY' : 'SELL'}
              </span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">New Price (₹)</label>
                <input
                  type="number"
                  value={modifyPrice}
                  onChange={e => setModifyPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new price"
                  step="0.05"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
                <input
                  type="number"
                  value={modifyQty}
                  onChange={e => setModifyQty(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Quantity"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setModifyOrder(null)}
                className="flex-1 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={submitModify}
                disabled={modifying}
                className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {modifying ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
                Modify
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Orders</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{sortedOrders.length}</span>
          {/* Completed BUY / SELL counts */}
          {completedBuys > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
              <CheckCircle size={10} />
              B&nbsp;{completedBuys}
            </span>
          )}
          {completedSells > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
              <CheckCircle size={10} />
              S&nbsp;{completedSells}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-gray-400 hover:text-blue-600 transition"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {sortedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
            <Clock size={24} className="opacity-20 mb-2" />
            <p className="text-sm">No orders today</p>
          </div>
        ) : (
          <>
            {/* Column headers – 7 cols: instrument(2) | side | qty | price | time | status */}
            <div className="grid grid-cols-7 text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-1.5 border-b border-gray-100 bg-white sticky top-0">
              <span className="col-span-2">Instrument</span>
              <span className="text-center">Side</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Exec Price</span>
              <span className="text-right">Time</span>
              <span className="text-right">Status</span>
            </div>

            <ul className="divide-y divide-gray-100">
              {sortedOrders.map((order, i) => {
                const isBuy = order.side?.toUpperCase() === 'BUY' || order.trnsTp === 'B' || order.transactionType === 'B';
                const canCancel = isPending(order.status || order.ordSt || '');
                const isComplete = (order.status || order.ordSt || '').toLowerCase().includes('complete');

                // Execution price: for completed orders prefer avgPrc (actual fill price),
                // for pending/limit orders show the limit price.
                const avgPrice = order.averagePrice ?? parseFloat(order.avgPrc || order.avgprc || '0');
                const limitPrice = order.price ?? parseFloat(order.prc || '0');
                const execPrice = isComplete && avgPrice > 0 ? avgPrice : limitPrice;
                const priceLabel = isComplete && avgPrice > 0 ? 'Avg' : (limitPrice > 0 ? 'Limit' : 'MKT');

                // Show fill time for executed orders, otherwise show placed time
                const displayTime = isComplete && (order.fillTimestamp || order.flTm)
                  ? formatTime(order.fillTimestamp || order.flTm)
                  : formatTime(order.timestamp || order.ordDtTm);

                const timeLabel = isComplete && (order.fillTimestamp || order.flTm)
                  ? 'Filled'
                  : 'Placed';

                return (
                  <li key={order.orderId || order.nOrdNo || i} className="group px-3 py-2.5 hover:bg-gray-50 transition">
                    <div className="grid grid-cols-7 items-center gap-1">
                      <div className="col-span-2 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {order.symbol || order.trdSym || order.sym || '—'}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {order.orderType || order.ordTp || '—'} · {order.productType || order.prdCode || '—'}
                        </p>
                      </div>
                      <p className={`text-xs font-bold text-center ${isBuy ? 'text-green-600' : 'text-red-600'}`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </p>
                      <p className="text-xs font-semibold text-gray-700 text-right">
                        {order.quantity || order.qty || '—'}
                      </p>
                      {/* Price column: shows avg fill price for completed orders */}
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700 tabular-nums">
                          {execPrice > 0 ? `₹${execPrice.toFixed(2)}` : 'MKT'}
                        </p>
                        <p className="text-xs text-gray-400">{priceLabel}</p>
                      </div>
                      {/* Time column */}
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700 tabular-nums">{displayTime}</p>
                        <p className="text-xs text-gray-400">{timeLabel}</p>
                      </div>
                      {/* Status + cancel + modify */}
                      <div className="flex flex-col items-end gap-0.5">
                        <div className={`flex items-center gap-1 text-xs font-semibold ${statusColor(order.status || order.ordSt || '')}`}>
                          {statusIcon(order.status || order.ordSt || '')}
                          <span className="hidden sm:inline capitalize">{order.status || order.ordSt || '—'}</span>
                        </div>
                        {canCancel && (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => openModify(order)}
                              className="text-xs text-blue-500 hover:text-blue-700 font-semibold"
                              title="Modify price"
                            >
                              Modify
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => onCancel(getOrderId(order))}
                              disabled={isLoading}
                              className="text-xs text-red-500 hover:text-red-700 font-semibold"
                              title="Cancel order"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
