'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OrderBook from './OrderBook';
import PositionBook from './PositionBook';
import QuickTrade from './QuickTrade_v2';
import StatsPanel from './StatsPanel';
import KillSwitch from './KillSwitch';
import { OptionsChain } from './OptionsChain';
import { ScripResult } from '@/lib/services/ScripSearchService';

export default function TradingDashboard() {
  const [selectedScrip, setSelectedScrip] = useState<{ scrip: ScripResult; side: 'BUY' | 'SELL' } | null>(null);

  const handleSelectScrip = (scrip: ScripResult, side: 'BUY' | 'SELL') => {
    setSelectedScrip({ scrip, side });
    // Scroll to QuickTrade component
    document.querySelector('[data-quick-trade]')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left Column - Stats & Quick Trade */}
      <div className="space-y-4">
        <StatsPanel />
        <div data-quick-trade>
          <QuickTrade preselected={selectedScrip} />
        </div>
        <KillSwitch />
      </div>

      {/* Right Column - Orders, Positions & Options Chain */}
      <div className="lg:col-span-2">
        <Tabs defaultValue="chain" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="orders">📋 Orders</TabsTrigger>
            <TabsTrigger value="positions">📊 Positions</TabsTrigger>
            <TabsTrigger value="chain">📈 Chain</TabsTrigger>
          </TabsList>
          
          <TabsContent value="orders" className="mt-4">
            <OrderBook />
          </TabsContent>
          
          <TabsContent value="positions" className="mt-4">
            <PositionBook />
          </TabsContent>

          <TabsContent value="chain" className="mt-4">
            <OptionsChain onSelectScrip={handleSelectScrip} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
