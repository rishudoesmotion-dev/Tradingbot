'use client';

import { useTradingStore } from '@/store/tradingStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Circle, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  onConnect: () => Promise<void>;
}

export default function ConnectionStatus({ onConnect }: ConnectionStatusProps) {
  const { isConnected, isLoading, disconnect } = useTradingStore();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Circle 
          className={`h-3 w-3 ${isConnected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'} ${isLoading ? 'pulse-animation' : ''}`} 
        />
        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      {isLoading ? (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </Button>
      ) : isConnected ? (
        <Button variant="destructive" onClick={disconnect}>
          Disconnect
        </Button>
      ) : (
        <Button onClick={onConnect}>
          Connect
        </Button>
      )}
    </div>
  );
}
