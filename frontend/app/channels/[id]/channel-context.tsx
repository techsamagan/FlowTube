'use client';

import { createContext, useContext } from 'react';
import type { Channel } from '@/lib/api';

type Ctx = { channel: Channel & { accountEmail: string }; reload: () => void };
export const ChannelContext = createContext<Ctx | null>(null);

export function useChannel() {
  const c = useContext(ChannelContext);
  if (!c) throw new Error('useChannel must be used inside a channel layout');
  return c;
}
