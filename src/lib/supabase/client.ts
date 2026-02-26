// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Database {
  public: {
    Tables: {
      risk_config: {
        Row: {
          id: string;
          max_trades_per_day: number;
          max_loss_limit: number;
          max_lots: number;
          max_position_size: number;
          stop_loss_percentage: number;
          target_profit_percentage: number;
          enable_kill_switch: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['risk_config']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['risk_config']['Insert']>;
      };
      trade_logs: {
        Row: {
          id: string;
          order_id: string;
          symbol: string;
          exchange: string;
          side: string;
          quantity: number;
          price: number;
          pnl: number;
          timestamp: string;
          broker_name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trade_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['trade_logs']['Insert']>;
      };
      positions: {
        Row: {
          id: string;
          symbol: string;
          exchange: string;
          product_type: string;
          quantity: number;
          buy_quantity: number;
          sell_quantity: number;
          buy_price: number;
          sell_price: number;
          ltp: number;
          pnl: number;
          pnl_percentage: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['positions']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['positions']['Insert']>;
      };
    };
  };
}
