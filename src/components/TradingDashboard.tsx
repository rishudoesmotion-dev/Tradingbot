'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OrderBook from './OrderBook';
import PositionBook from './PositionBook';
import QuickTrade from './QuickTrade';
import StatsPanel from './StatsPanel';
import KillSwitch from './KillSwitch';

export default function TradingDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left Column - Stats & Quick Trade */}
      <div className="space-y-4">
        <StatsPanel />
        <QuickTrade />
        <KillSwitch />
      </div>

      {/* Right Column - Orders & Positions */}
      <div className="lg:col-span-2">
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="orders" className="mt-4">
            <OrderBook />
          </TabsContent>
          
          <TabsContent value="positions" className="mt-4">
            <PositionBook />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
