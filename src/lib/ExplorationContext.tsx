'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * How much of the archive this visitor has actually opened.
 *
 * Deliberately in memory only. The design brief allows exactly one localStorage
 * key and the theme has it, so exploration resets with the session — which is
 * also the right behaviour for a thing you are meant to walk into and discover.
 * Nothing here is persisted, synced or sent anywhere.
 */
interface ExplorationContextType {
  /** Receipt ids opened in detail this session. */
  seen: ReadonlySet<string>;
  /** Thread ids expanded this session. */
  threadsSeen: ReadonlySet<string>;
  markSeen: (id: string) => void;
  markThreadSeen: (id: string) => void;
  seenCount: number;
  threadsSeenCount: number;
}

const ExplorationContext = createContext<ExplorationContextType>({
  seen: new Set(),
  threadsSeen: new Set(),
  markSeen: () => {},
  markThreadSeen: () => {},
  seenCount: 0,
  threadsSeenCount: 0,
});

export function useExploration() {
  return useContext(ExplorationContext);
}

export function ExplorationProvider({ children }: { children: React.ReactNode }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [threadsSeen, setThreadsSeen] = useState<Set<string>>(() => new Set());

  // A new Set per call rather than mutating in place: React compares by
  // reference, so mutating would leave every consumer on the stale count.
  const markSeen = useCallback((id: string) => {
    setSeen(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const markThreadSeen = useCallback((id: string) => {
    setThreadsSeen(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const value = useMemo(
    () => ({
      seen,
      threadsSeen,
      markSeen,
      markThreadSeen,
      seenCount: seen.size,
      threadsSeenCount: threadsSeen.size,
    }),
    [seen, threadsSeen, markSeen, markThreadSeen],
  );

  return <ExplorationContext.Provider value={value}>{children}</ExplorationContext.Provider>;
}
