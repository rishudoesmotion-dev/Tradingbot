'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = 'close_above' | 'close_below';
type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface CandleInfo {
  open: number; high: number; low: number; close: number;
  type: 'bullish' | 'bearish' | 'neutral';
  patternLabel: string;
  emoji: string;
  description: string;
}

interface Alert {
  id: string;
  level: number;
  triggerType: TriggerType;
  triggered: boolean;
  triggeredAt?: string;
  triggerCandle?: CandleInfo;
  createdAt: string;
}

interface Toast {
  id: string;
  alert: Alert;
  candle: CandleInfo;
  closing: boolean;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

interface PriceAlertsProps {
  currentPrice: number | null;
}

// ─── Candle classifier ────────────────────────────────────────────────────────

function identifyCandle(c: { open: number; high: number; low: number; close: number }): CandleInfo {
  const { open, high, low, close } = c;
  const body  = Math.abs(close - open);
  const range = high - low;

  if (range < 0.01) {
    return { open, high, low, close, type: 'neutral', patternLabel: 'Doji', emoji: '⚪', description: 'No range — flat price' };
  }

  const upperWick  = high - Math.max(open, close);
  const lowerWick  = Math.min(open, close) - low;
  const bodyRatio  = body / range;
  const upperRatio = upperWick / range;
  const lowerRatio = lowerWick / range;
  const bull       = close > open;

  if (bodyRatio < 0.05) {
    if (upperRatio > 0.4 && lowerRatio < 0.1)
      return { open, high, low, close, type: 'neutral', patternLabel: 'Gravestone Doji', emoji: '🪦', description: 'Bearish reversal signal — price rejected at highs' };
    if (lowerRatio > 0.4 && upperRatio < 0.1)
      return { open, high, low, close, type: 'neutral', patternLabel: 'Dragonfly Doji', emoji: '🐉', description: 'Bullish reversal signal — price rejected at lows' };
    return { open, high, low, close, type: 'neutral', patternLabel: 'Doji', emoji: '⚪', description: 'Indecision — bulls and bears equal' };
  }

  if (bodyRatio > 0.85 && upperRatio < 0.08 && lowerRatio < 0.08) {
    return bull
      ? { open, high, low, close, type: 'bullish', patternLabel: 'Bull Marubozu', emoji: '🟢', description: 'Strong buying — no wicks, full commitment' }
      : { open, high, low, close, type: 'bearish', patternLabel: 'Bear Marubozu', emoji: '🔴', description: 'Strong selling — no wicks, full commitment' };
  }

  if (lowerRatio > 0.55 && upperRatio < 0.15 && bodyRatio < 0.35) {
    return bull
      ? { open, high, low, close, type: 'bullish', patternLabel: 'Hammer', emoji: '🔨', description: 'Bullish reversal — sellers pushed down but buyers took over' }
      : { open, high, low, close, type: 'bearish', patternLabel: 'Hanging Man', emoji: '🪢', description: 'Bearish warning — could signal reversal at top' };
  }

  if (upperRatio > 0.55 && lowerRatio < 0.15 && bodyRatio < 0.35) {
    return bull
      ? { open, high, low, close, type: 'bullish', patternLabel: 'Inv. Hammer', emoji: '🔧', description: 'Potential bullish reversal — buyers pushed up' }
      : { open, high, low, close, type: 'bearish', patternLabel: 'Shooting Star', emoji: '🌠', description: 'Bearish reversal — price rejected at highs' };
  }

  if (bodyRatio < 0.35 && upperRatio > 0.15 && lowerRatio > 0.15) {
    return { open, high, low, close, type: 'neutral', patternLabel: 'Spinning Top', emoji: '🌀', description: 'Indecision — neither bulls nor bears in control' };
  }

  if (bodyRatio > 0.60) {
    return bull
      ? { open, high, low, close, type: 'bullish', patternLabel: 'Strong Bull', emoji: '🐂', description: 'Momentum candle — buyers dominant' }
      : { open, high, low, close, type: 'bearish', patternLabel: 'Strong Bear', emoji: '🐻', description: 'Momentum candle — sellers dominant' };
  }

  return bull
    ? { open, high, low, close, type: 'bullish', patternLabel: 'Bullish Candle', emoji: '📈', description: 'Mild buying pressure' }
    : { open, high, low, close, type: 'bearish', patternLabel: 'Bearish Candle', emoji: '📉', description: 'Mild selling pressure' };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY      = 'priceAlerts_v5';
const TG_KEY   = 'priceAlerts_telegram_v1';

const load     = (): Alert[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save     = (a: Alert[]) => localStorage.setItem(KEY, JSON.stringify(a));

const loadTg   = (): TelegramConfig => {
  try { return JSON.parse(localStorage.getItem(TG_KEY) || 'null') || { botToken: '', chatId: '', enabled: false }; }
  catch { return { botToken: '', chatId: '', enabled: false }; }
};
const saveTg   = (cfg: TelegramConfig) => localStorage.setItem(TG_KEY, JSON.stringify(cfg));

const fmtP = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtT = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  : '';

// ─── Notification helpers ─────────────────────────────────────────────────────

async function requestNotifPermission(): Promise<NotifPermission> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  const result = await Notification.requestPermission();
  return result as NotifPermission;
}

function fireWebPush(alert: Alert, candle: CandleInfo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const ab    = alert.triggerType === 'close_above';
  const dir   = ab ? '▲' : '▼';
  const title = `🔔 NIFTY ${dir} ₹${fmtP(alert.level)}`;
  const body  = `${candle.emoji} ${candle.patternLabel} · ${candle.description}`;
  try {
    new Notification(title, {
      body,
      icon:  'https://cdn.jsdelivr.net/npm/twemoji@14/assets/72x72/1f514.png',
      badge: 'https://cdn.jsdelivr.net/npm/twemoji@14/assets/72x72/1f514.png',
      tag:   alert.id,
    });
  } catch (e) {
    console.warn('[PriceAlerts] Notification failed:', e);
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function fireTelegram(cfg: TelegramConfig, alert: Alert, candle: CandleInfo): Promise<void> {
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;

  const ab  = alert.triggerType === 'close_above';
  const dir = ab ? '▲ Closed Above' : '▼ Closed Below';

  // OHLC line
  const ohlc = `O: ${candle.open.toFixed(2)}  H: ${candle.high.toFixed(2)}  L: ${candle.low.toFixed(2)}  C: ${candle.close.toFixed(2)}`;

  const msg = [
    `🔔 *NIFTY Alert Triggered*`,
    ``,
    `${dir} *₹${fmtP(alert.level)}*`,
    ``,
    `${candle.emoji} *${candle.patternLabel}*`,
    `_${candle.description}_`,
    ``,
    `\`${ohlc}\``,
    ``,
    `🕐 _${fmtT(alert.triggeredAt)}_`,
  ].join('\n');

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken.trim()}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id:    cfg.chatId.trim(),
          text:       msg,
          parse_mode: 'Markdown',
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      console.warn('[PriceAlerts] Telegram error:', err);
    }
  } catch (e) {
    console.warn('[PriceAlerts] Telegram fetch failed:', e);
  }
}

// ─── Scoped CSS ───────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.pa-root *, .pa-root *::before, .pa-root *::after {
  box-sizing: border-box;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  -webkit-font-smoothing: antialiased;
}
.pa-root {
  display: flex; flex-direction: column; height: 100%;
  background: #fff; color: #111827; font-size: 12px; position: relative;
}

/* Header */
.pa-header {
  padding: 10px 12px; background: #f9fafb;
  border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
}
.pa-title-row {
  display: flex; align-items: center;
  justify-content: space-between; margin-bottom: 10px;
}
.pa-title { font-size: 12px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 5px; }
.pa-title-actions { display: flex; align-items: center; gap: 6px; }
.pa-ltp-chip {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 500; color: #9ca3af;
}
.pa-ltp-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #6b7280;
  opacity: 0.5;
}
@keyframes pa-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* Sleep guard indicator */
/* Settings icon button */
.pa-icon-btn {
  background: none; border: 1px solid #e5e7eb; border-radius: 6px;
  cursor: pointer; padding: 3px 7px; color: #6b7280; font-size: 13px;
  transition: background 0.12s, color 0.12s;
}
.pa-icon-btn:hover { background: #f3f4f6; color: #111827; }
.pa-icon-btn.active { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }

/* Toggle */
.pa-toggle {
  display: flex; gap: 5px; margin-bottom: 8px;
  background: #f3f4f6; padding: 3px; border-radius: 8px;
}
.pa-btn-toggle {
  flex: 1; padding: 5px 0; font-size: 10px; font-weight: 600;
  letter-spacing: 0.3px; border-radius: 6px; cursor: pointer;
  border: none; background: transparent; color: #6b7280;
  transition: all 0.12s;
}
.pa-btn-toggle.above.active { background: #fff; color: #16a34a; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.pa-btn-toggle.below.active { background: #fff; color: #dc2626; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.pa-btn-toggle:not(.active):hover { color: #374151; }

/* Input */
.pa-input-row { display: flex; gap: 6px; }
.pa-input {
  flex: 1; padding: 6px 10px; font-size: 12px; font-weight: 500;
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  color: #111827; outline: none; transition: border-color 0.12s, box-shadow 0.12s;
}
.pa-input::placeholder { color: #9ca3af; }
.pa-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.pa-btn-add {
  padding: 6px 14px; font-size: 11px; font-weight: 600;
  border: none; border-radius: 6px; color: #fff; cursor: pointer;
  white-space: nowrap; transition: opacity 0.12s;
}
.pa-btn-add:hover { opacity: 0.88; }
.pa-btn-add.above { background: #16a34a; }
.pa-btn-add.below { background: #dc2626; }
.pa-error { font-size: 10px; color: #dc2626; margin: 4px 0 0; }

/* Stats */
.pa-stats {
  display: flex; align-items: center; margin-top: 8px;
  padding-top: 8px; border-top: 1px solid #e5e7eb;
  font-size: 10px; color: #6b7280;
}
.pa-stats-num { color: #111827; font-weight: 600; }
.pa-stats-hit { color: #16a34a; font-weight: 600; }
.pa-stats-actions { margin-left: auto; display: flex; gap: 10px; }
.pa-ghost-btn { background: none; border: none; cursor: pointer; font-size: 10px; color: #6b7280; text-decoration: underline; padding: 0; }
.pa-ghost-btn.danger { color: #dc2626; }

/* ── Notification permission banner ── */
.pa-notif-banner {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px; padding: 7px 10px;
  background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px;
  font-size: 10px; color: #92400e;
}
.pa-notif-banner-text { flex: 1; line-height: 1.4; }
.pa-notif-banner-text strong { display: block; font-weight: 600; margin-bottom: 1px; }
.pa-btn-notif-enable {
  flex-shrink: 0; padding: 4px 10px; font-size: 10px; font-weight: 600;
  background: #f59e0b; color: #fff; border: none; border-radius: 5px;
  cursor: pointer; white-space: nowrap; transition: background 0.12s;
}
.pa-btn-notif-enable:hover { background: #d97706; }
.pa-notif-banner.granted { background: #f0fdf4; border-color: #86efac; color: #166534; }
.pa-notif-banner.denied  { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
.pa-notif-banner-close {
  background: none; border: none; cursor: pointer; color: inherit;
  font-size: 14px; line-height: 1; padding: 0 2px; opacity: 0.6;
}
.pa-notif-banner-close:hover { opacity: 1; }

/* ── Telegram Settings Panel ── */
.pa-tg-panel {
  margin-top: 8px; padding: 10px 12px;
  background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;
}
.pa-tg-title {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; font-weight: 700; color: #0369a1; margin-bottom: 8px;
}
.pa-tg-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.pa-tg-toggle-label { font-size: 10px; color: #0c4a6e; font-weight: 500; }
/* Toggle switch */
.pa-switch { position: relative; width: 32px; height: 18px; }
.pa-switch input { opacity: 0; width: 0; height: 0; }
.pa-switch-slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background: #d1d5db; border-radius: 18px; transition: background 0.2s;
}
.pa-switch-slider::before {
  content: ''; position: absolute; height: 12px; width: 12px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%; transition: transform 0.2s;
}
.pa-switch input:checked + .pa-switch-slider { background: #0284c7; }
.pa-switch input:checked + .pa-switch-slider::before { transform: translateX(14px); }

.pa-tg-field { margin-bottom: 6px; }
.pa-tg-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #0369a1; margin-bottom: 3px; }
.pa-tg-input {
  width: 100%; padding: 5px 8px; font-size: 11px; font-weight: 500;
  background: #fff; border: 1px solid #bae6fd; border-radius: 5px;
  color: #0c4a6e; outline: none; transition: border-color 0.12s;
  font-family: monospace !important;
}
.pa-tg-input::placeholder { color: #93c5fd; }
.pa-tg-input:focus { border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2,132,199,0.15); }
.pa-tg-actions { display: flex; gap: 6px; margin-top: 8px; }
.pa-tg-btn {
  flex: 1; padding: 5px 0; font-size: 10px; font-weight: 600;
  border-radius: 5px; border: none; cursor: pointer; transition: opacity 0.12s;
}
.pa-tg-btn.save { background: #0284c7; color: #fff; }
.pa-tg-btn.test { background: #e0f2fe; color: #0369a1; }
.pa-tg-btn:hover { opacity: 0.85; }
.pa-tg-status {
  margin-top: 6px; font-size: 10px; padding: 4px 8px; border-radius: 4px;
}
.pa-tg-status.ok  { background: #f0fdf4; color: #166534; }
.pa-tg-status.err { background: #fef2f2; color: #991b1b; }
.pa-tg-help {
  margin-top: 8px; font-size: 9px; color: #0369a1; line-height: 1.5;
  background: #e0f2fe; border-radius: 4px; padding: 6px 8px;
}
.pa-tg-help a { color: #0284c7; }

/* Empty */
.pa-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; color: #d1d5db; gap: 8px; font-size: 11px;
}

/* List */
.pa-list { flex: 1; overflow-y: auto; }
.pa-alert-row {
  padding: 10px 12px; border-bottom: 1px solid #f3f4f6;
  border-left: 3px solid transparent; background: transparent;
}
.pa-alert-row.hit-above { border-left-color: #16a34a; background: #f0fdf4; }
.pa-alert-row.hit-below { border-left-color: #dc2626; background: #fef2f2; }

.pa-row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.pa-row1-left { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pa-level { font-size: 13px; font-weight: 700; color: #111827; }

.pa-tag { font-size: 9px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.pa-tag-above  { background: #dcfce7; color: #15803d; }
.pa-tag-below  { background: #fee2e2; color: #b91c1c; }
.pa-tag-hit    { background: #16a34a; color: #fff; }
.pa-tag-tg     { background: #e0f2fe; color: #0369a1; }
.pa-tag-closed { background: #6b7280; color: #fff; font-size: 9px; }

.pa-remove { background: none; border: none; cursor: pointer; color: #9ca3af; padding: 2px; line-height: 1; font-size: 16px; transition: color 0.12s; flex-shrink: 0; }
.pa-remove:hover { color: #dc2626; }

.pa-row2 { font-size: 10px; color: #9ca3af; display: flex; gap: 10px; flex-wrap: wrap; }
.pa-dist-pos { color: #16a34a; font-weight: 600; }
.pa-dist-neg { color: #dc2626; font-weight: 600; }

.pa-candle-card {
  margin-top: 8px; padding: 9px 10px;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
}
.pa-candle-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
.pa-candle-time { font-size: 10px; color: #6b7280; }
.pa-candle-pattern { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.pa-pattern-name { font-size: 11px; font-weight: 700; }
.pa-pattern-desc { font-size: 9px; color: #6b7280; text-align: right; max-width: 160px; line-height: 1.3; }
.pa-candle-bull { color: #16a34a; }
.pa-candle-bear { color: #dc2626; }
.pa-candle-neu  { color: #6b7280; }
.pa-ohlc { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.pa-ohlc-lbl { font-size: 9px; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; font-weight: 500; }
.pa-ohlc-val { font-size: 11px; font-weight: 600; color: #111827; }
.pa-ohlc-val.h { color: #16a34a; }
.pa-ohlc-val.l { color: #dc2626; }
.pa-ohlc-val.c { color: #1d4ed8; }

/* ══════════════════════════════════════════════════════
   IN-APP TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════ */
.pa-toast-stack {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  display: flex; flex-direction: column-reverse; gap: 10px;
  pointer-events: none;
}
.pa-toast {
  pointer-events: all; width: 300px; background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  animation: pa-toast-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both;
  border-left: 4px solid transparent;
}
.pa-toast.above  { border-left-color: #16a34a; }
.pa-toast.below  { border-left-color: #dc2626; }
.pa-toast.closing { animation: pa-toast-out 0.22s ease-in both; }

@keyframes pa-toast-in  { from{opacity:0;transform:translateX(32px) scale(0.94)} to{opacity:1;transform:translateX(0) scale(1)} }
@keyframes pa-toast-out { from{opacity:1;transform:translateX(0) scale(1)} to{opacity:0;transform:translateX(40px) scale(0.92)} }

.pa-toast-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 6px; }
.pa-toast-title-row { display: flex; align-items: center; gap: 6px; }
.pa-toast-bell { font-size: 15px; animation: pa-ring 0.5s ease 0.1s both; }
@keyframes pa-ring {
  0%{transform:rotate(0)} 20%{transform:rotate(-20deg)} 40%{transform:rotate(20deg)}
  60%{transform:rotate(-12deg)} 80%{transform:rotate(8deg)} 100%{transform:rotate(0)}
}
.pa-toast-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.pa-toast-label.above { color: #16a34a; }
.pa-toast-label.below { color: #dc2626; }
.pa-toast-close { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 16px; line-height: 1; padding: 0; transition: color 0.1s; }
.pa-toast-close:hover { color: #374151; }
.pa-toast-body { padding: 0 12px 10px; }
.pa-toast-price { font-size: 18px; font-weight: 800; color: #111827; line-height: 1.1; }
.pa-toast-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
.pa-toast-candle {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 8px; padding: 7px 10px; border-radius: 6px; background: #f9fafb;
}
.pa-toast-candle-left { display: flex; flex-direction: column; gap: 2px; }
.pa-toast-pattern { font-size: 11px; font-weight: 700; }
.pa-toast-pattern.bullish { color: #16a34a; }
.pa-toast-pattern.bearish { color: #dc2626; }
.pa-toast-pattern.neutral { color: #6b7280; }
.pa-toast-desc { font-size: 9px; color: #6b7280; max-width: 180px; line-height: 1.3; }
.pa-toast-emoji { font-size: 22px; line-height: 1; }
.pa-toast-progress { height: 3px; background: #f3f4f6; }
.pa-toast-progress-bar { height: 100%; border-radius: 0 2px 0 0; animation: pa-progress 6s linear forwards; }
.pa-toast.above .pa-toast-progress-bar { background: #16a34a; }
.pa-toast.below .pa-toast-progress-bar { background: #dc2626; }
@keyframes pa-progress { from{width:100%} to{width:0%} }
`;

// ─── Toast Component ──────────────────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const ab  = toast.alert.triggerType === 'close_above';
  const c   = toast.candle;
  const cls = ab ? 'above' : 'below';

  return (
    <div className={`pa-toast ${cls}${toast.closing ? ' closing' : ''}`}>
      <div className="pa-toast-header">
        <div className="pa-toast-title-row">
          <span className="pa-toast-bell">🔔</span>
          <span className={`pa-toast-label ${cls}`}>
            {ab ? '▲ Close Above' : '▼ Close Below'} — Alert Hit
          </span>
        </div>
        <button className="pa-toast-close" onClick={() => onClose(toast.id)}>×</button>
      </div>
      <div className="pa-toast-body">
        <div className="pa-toast-price">₹{fmtP(toast.alert.level)}</div>
        <div className="pa-toast-sub">NIFTY · 5m candle closed · {fmtT(toast.alert.triggeredAt)}</div>
        <div className="pa-toast-candle">
          <div className="pa-toast-candle-left">
            <span className={`pa-toast-pattern ${c.type}`}>{c.emoji} {c.patternLabel}</span>
            <span className="pa-toast-desc">{c.description}</span>
          </div>
          <span className="pa-toast-emoji">{c.emoji}</span>
        </div>
      </div>
      <div className="pa-toast-progress"><div className="pa-toast-progress-bar" /></div>
    </div>
  );
}

// ─── Notification Banner ──────────────────────────────────────────────────────

function NotifBanner({
  permission, onRequest, onDismiss,
}: { permission: NotifPermission; onRequest: () => void; onDismiss: () => void; }) {
  if (permission === 'unsupported') return null;

  if (permission === 'granted') {
    return (
      <div className="pa-notif-banner granted">
        <span>🔔</span>
        <span className="pa-notif-banner-text">
          <strong>Push notifications ON</strong>
          Alerts will notify you even when tab is in background
        </span>
        <button className="pa-notif-banner-close" onClick={onDismiss}>×</button>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="pa-notif-banner denied">
        <span>🔕</span>
        <span className="pa-notif-banner-text">
          <strong>Notifications blocked</strong>
          Enable in browser settings to get push alerts
        </span>
        <button className="pa-notif-banner-close" onClick={onDismiss}>×</button>
      </div>
    );
  }

  return (
    <div className="pa-notif-banner">
      <span>🔔</span>
      <span className="pa-notif-banner-text">
        <strong>Enable push notifications?</strong>
        Get alerted even when this tab is in background
      </span>
      <button className="pa-btn-notif-enable" onClick={onRequest}>Enable</button>
      <button className="pa-notif-banner-close" onClick={onDismiss}>×</button>
    </div>
  );
}

// ─── Telegram Settings Panel ──────────────────────────────────────────────────

function TelegramPanel({
  config,
  onSave,
}: {
  config: TelegramConfig;
  onSave: (cfg: TelegramConfig) => void;
}) {
  const [token,  setToken]  = useState(config.botToken);
  const [chatId, setChatId] = useState(config.chatId);
  const [enabled,setEnabled]= useState(config.enabled);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleSave = () => {
    const cfg: TelegramConfig = { botToken: token, chatId, enabled };
    onSave(cfg);
    setStatus({ type: 'ok', msg: '✓ Settings saved' });
    setTimeout(() => setStatus(null), 2500);
  };

  const handleTest = async () => {
    if (!token || !chatId) { setStatus({ type: 'err', msg: '✗ Fill in Bot Token and Chat ID first' }); return; }
    setStatus(null);
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token.trim()}/sendMessage`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id:    chatId.trim(),
            text:       '🔔 *NIFTY Alerts* — Test message ✓\nTelegram is configured correctly!',
            parse_mode: 'Markdown',
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setStatus({ type: 'ok', msg: '✓ Test message sent! Check Telegram.' });
      } else {
        setStatus({ type: 'err', msg: `✗ ${data.description || 'Unknown error'}` });
      }
    } catch {
      setStatus({ type: 'err', msg: '✗ Network error — check token & chat ID' });
    }
  };

  return (
    <div className="pa-tg-panel">
      <div className="pa-tg-title">
        <span>✈️ Telegram Alerts</span>
      </div>

      <div className="pa-tg-toggle-row">
        <span className="pa-tg-toggle-label">Send Telegram on trigger</span>
        <label className="pa-switch">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className="pa-switch-slider" />
        </label>
      </div>

      <div className="pa-tg-field">
        <div className="pa-tg-label">Bot Token</div>
        <input
          className="pa-tg-input" type="password"
          placeholder="123456:ABC-DEF..."
          value={token}
          onChange={e => setToken(e.target.value)}
        />
      </div>

      <div className="pa-tg-field">
        <div className="pa-tg-label">Chat ID</div>
        <input
          className="pa-tg-input" type="text"
          placeholder="-100xxxxxxxx or @yourchannel"
          value={chatId}
          onChange={e => setChatId(e.target.value)}
        />
      </div>

      <div className="pa-tg-actions">
        <button className="pa-tg-btn save" onClick={handleSave}>Save</button>
        <button className="pa-tg-btn test" onClick={handleTest}>Send test</button>
      </div>

      {status && (
        <div className={`pa-tg-status ${status.type}`}>{status.msg}</div>
      )}

      <div className="pa-tg-help">
        <strong>Setup:</strong> Message <code>@BotFather</code> → /newbot → copy token above.<br />
        Then message <code>@userinfobot</code> to get your Chat ID.
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TOAST_DURATION = 6000;

export function PriceAlerts({ currentPrice }: PriceAlertsProps) {
  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [input,      setInput]      = useState('');
  const [trigType,   setTrigType]   = useState<TriggerType>('close_above');
  const [error,      setError]      = useState<string | null>(null);
  const [isLoaded,   setIsLoaded]   = useState(false);
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [notifPerm,  setNotifPerm]  = useState<NotifPermission>('default');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showTgPanel, setShowTgPanel] = useState(false);
  const [tgConfig,   setTgConfig]   = useState<TelegramConfig>({ botToken: '', chatId: '', enabled: false });
  const candleRef       = useRef<{ open: number; high: number; low: number; close: number } | null>(null);
  const candleOpenMsRef = useRef<number>(0);
  const lastPriceRef    = useRef<number>(0);
  const tgConfigRef     = useRef<TelegramConfig>(tgConfig);

  // Keep tgConfigRef in sync so fireNotifications closure always has latest
  useEffect(() => { tgConfigRef.current = tgConfig; }, [tgConfig]);

  // Inject CSS once
  useEffect(() => {
    const id = 'pa-styles-v7';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);

  // Load from storage + check notification permission
  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAlerts = load().filter(a => new Date(a.createdAt) >= todayStart);
    setAlerts(todayAlerts);
    setTgConfig(loadTg());
    setIsLoaded(true);
    if ('Notification' in window) {
      setNotifPerm(Notification.permission as NotifPermission);
    } else {
      setNotifPerm('unsupported');
    }
  }, []);

  useEffect(() => { if (isLoaded) save(alerts); }, [alerts, isLoaded]);

  // ── Dismiss toast ──
  const dismissToast = useCallback((id: string) => {
    setToasts(t => t.map(x => x.id === id ? { ...x, closing: true } : x));
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 240);
  }, []);

  // ── Fire all notification channels ──
  const fireNotifications = useCallback((alert: Alert, candle: CandleInfo) => {
    fireWebPush(alert, candle);

    const toastId = `t_${Date.now()}_${alert.id}`;
    setToasts(t => [...t, { id: toastId, alert: { ...alert }, candle, closing: false }]);
    setTimeout(() => dismissToast(toastId), TOAST_DURATION);

    // Telegram — use ref to get latest config without stale closure
    fireTelegram(tgConfigRef.current, alert, candle).catch(console.warn);
  }, [dismissToast]);

  // ── Candle engine: driven purely by currentPrice prop (no setInterval) ──
  // The parent's WebSocket already pushes price updates — we just react to them.
  // On tab wake (visibilitychange), the parent feed will push a new price which
  // re-triggers this effect, so no missed candle boundaries.
  useEffect(() => {
    if (!currentPrice || !isLoaded) return;
    const price   = currentPrice;
    const startMs = Math.floor(Date.now() / 300_000) * 300_000;

    if (candleOpenMsRef.current !== startMs) {
      const prev      = candleRef.current;
      const prevClose = lastPriceRef.current;

      if (prev && prevClose > 0) {
        const info = identifyCandle(prev);
        setAlerts(cur => cur.map(a => {
          if (a.triggered) return a;
          const hit =
            (a.triggerType === 'close_above' && prevClose >= a.level) ||
            (a.triggerType === 'close_below' && prevClose <= a.level);
          if (!hit) return a;
          const triggered: Alert = {
            ...a, triggered: true,
            triggeredAt: new Date().toISOString(),
            triggerCandle: info,
          };
          setTimeout(() => fireNotifications(triggered, info), 0);
          return triggered;
        }));
      }

      candleOpenMsRef.current = startMs;
      candleRef.current = { open: price, high: price, low: price, close: price };
    } else {
      candleRef.current = candleRef.current
        ? { open: candleRef.current.open, high: Math.max(candleRef.current.high, price), low: Math.min(candleRef.current.low, price), close: price }
        : { open: price, high: price, low: price, close: price };
    }

    lastPriceRef.current = price;
  }, [currentPrice, isLoaded, fireNotifications]);

  const handleSaveTg = (cfg: TelegramConfig) => {
    setTgConfig(cfg);
    saveTg(cfg);
  };

  const handleRequestPermission = async () => {
    const result = await requestNotifPermission();
    setNotifPerm(result);
  };

  const addAlert = () => {
    const level = parseFloat(input);
    if (isNaN(level) || level <= 0) { setError('Enter a valid price'); return; }
    setAlerts(p => [...p, {
      id: `a_${Date.now()}`, level, triggerType: trigType,
      triggered: false, createdAt: new Date().toISOString(),
    }]);
    setInput('');
    setError(null);
  };

  const removeAlert = (id: string) => setAlerts(p => p.filter(a => a.id !== id));
  const clearAll    = ()           => setAlerts([]);
  const resetAll    = ()           => setAlerts(p => p.map(a => ({
    ...a, triggered: false, triggeredAt: undefined, triggerCandle: undefined,
  })));

  const pending    = alerts.filter(a => !a.triggered).length;
  const triggered  = alerts.filter(a =>  a.triggered).length;
  const isAboveSel = trigType === 'close_above';
  const showBanner = !bannerDismissed && notifPerm !== 'unsupported';

  return (
    <>
      <div className="pa-toast-stack">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={dismissToast} />
        ))}
      </div>

      <div className="pa-root">
        <div className="pa-header">

          <div className="pa-title-row">
            <span className="pa-title">🔔 Price Triggers</span>
            <div className="pa-title-actions">
{/* Telegram settings toggle */}
              <button
                className={`pa-icon-btn${showTgPanel ? ' active' : ''}`}
                title="Telegram settings"
                onClick={() => setShowTgPanel(v => !v)}
              >
                ✈️
              </button>

              {currentPrice != null && (
                <div className="pa-ltp-chip">
                  <span className="pa-ltp-dot" />
                  ₹{fmtP(currentPrice)}
                </div>
              )}
            </div>
          </div>

          <div className="pa-toggle">
            <button className={`pa-btn-toggle above${isAboveSel ? ' active' : ''}`} onClick={() => setTrigType('close_above')}>
              ▲ Close Above
            </button>
            <button className={`pa-btn-toggle below${!isAboveSel ? ' active' : ''}`} onClick={() => setTrigType('close_below')}>
              ▼ Close Below
            </button>
          </div>

          <div className="pa-input-row">
            <input
              className="pa-input" type="number" placeholder="e.g. 24600"
              value={input}
              onChange={e => { setInput(e.target.value); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && addAlert()}
            />
            <button className={`pa-btn-add ${isAboveSel ? 'above' : 'below'}`} onClick={addAlert}>
              + Add
            </button>
          </div>
          {error && <p className="pa-error">{error}</p>}

          {showTgPanel && (
            <TelegramPanel config={tgConfig} onSave={handleSaveTg} />
          )}

          {showBanner && (
            <NotifBanner
              permission={notifPerm}
              onRequest={handleRequestPermission}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}

          {alerts.length > 0 && (
            <div className="pa-stats">
              <span style={{ marginRight: 10 }}>Pending <span className="pa-stats-num">{pending}</span></span>
              <span>Triggered <span className="pa-stats-hit">{triggered}</span></span>
              <span className="pa-stats-actions">
                {triggered > 0 && <button className="pa-ghost-btn" onClick={resetAll}>Reset</button>}
                <button className="pa-ghost-btn danger" onClick={clearAll}>Clear all</button>
              </span>
            </div>
          )}
        </div>

        <div className="pa-list">
          {alerts.length === 0 ? (
            <div className="pa-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              No triggers set
            </div>
          ) : (
            alerts.map(alert => {
              const ab   = alert.triggerType === 'close_above';
              const dist = (!alert.triggered && currentPrice != null) ? currentPrice - alert.level : null;
              const dStr = dist !== null ? (dist >= 0 ? '+' : '') + dist.toFixed(2) : null;
              const c    = alert.triggerCandle;
              const rowCls = `pa-alert-row${alert.triggered ? (ab ? ' hit-above' : ' hit-below') : ''}`;
              const patternColorClass = c
                ? (c.type === 'bullish' ? 'pa-candle-bull' : c.type === 'bearish' ? 'pa-candle-bear' : 'pa-candle-neu')
                : '';

              return (
                <div key={alert.id} className={rowCls}>
                  <div className="pa-row1">
                    <div className="pa-row1-left">
                      <span className="pa-level">₹{fmtP(alert.level)}</span>
                      <span className={`pa-tag ${ab ? 'pa-tag-above' : 'pa-tag-below'}`}>
                        {ab ? '▲ Above' : '▼ Below'}
                      </span>
                      {alert.triggered && <span className="pa-tag pa-tag-hit">✓ Hit</span>}
                      {alert.triggered && tgConfig.enabled && <span className="pa-tag pa-tag-tg">✈️ TG</span>}
                      {alert.triggered && <span className="pa-tag pa-tag-closed">🔒 Closed</span>}
                    </div>
                    <button className="pa-remove" onClick={() => removeAlert(alert.id)}>×</button>
                  </div>

                  {!alert.triggered && (
                    <div className="pa-row2">
                      <span>Dist: <span className={dist! >= 0 ? 'pa-dist-pos' : 'pa-dist-neg'}>{dStr}</span></span>
                      <span>Added {fmtT(alert.createdAt)}</span>
                    </div>
                  )}

                  {alert.triggered && c && (
                    <div className="pa-candle-card">
                      <div className="pa-candle-top">
                        <div className="pa-candle-time">
                          Triggered @ {fmtT(alert.triggeredAt)}<br />
                          5m candle closed
                        </div>
                        <div className="pa-candle-pattern">
                          <span className={`pa-pattern-name ${patternColorClass}`}>
                            {c.emoji} {c.patternLabel}
                          </span>
                          <span className="pa-pattern-desc">{c.description}</span>
                        </div>
                      </div>
                      <div className="pa-ohlc">
                        {(['open','high','low','close'] as const).map(k => (
                          <div key={k}>
                            <div className="pa-ohlc-lbl">{k}</div>
                            <div className={`pa-ohlc-val${k==='high'?' h':k==='low'?' l':k==='close'?' c':''}`}>
                              {c[k].toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}