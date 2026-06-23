'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, unwrap } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5000';

export type PriceTick = {
  symbol: string;
  price: string;
  change24h: string;
  high: string;
  low: string;
  volume: string;
};

export function usePrices() {
  const [prices, setPrices] = useState<PriceTick[]>([]);

  useEffect(() => {
    api.get('/market/prices').then((r) => setPrices(unwrap(r))).catch(() => {});
    const socket = io(API, { transports: ['websocket'] });
    socket.on('price_update', (data: PriceTick[]) => setPrices(data));
    return () => { socket.disconnect(); };
  }, []);

  return prices;
}
