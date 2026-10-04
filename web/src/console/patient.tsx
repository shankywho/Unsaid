import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMe } from '../api/hooks';
import type { StreamStatus } from '../stream/useEventStream';

interface Patient {
  id: string;
  displayName: string;
  contextEnabled: boolean;
  assistMode: string;
}
interface Ctx {
  patients: Patient[];
  patient?: Patient;
  select: (id: string) => void;
}
const C = createContext<Ctx>({ patients: [], select: () => undefined });

/** Live pushes its SSE state here so the Omi chip in the top bar can show connection state. */
interface StreamCtx {
  status: StreamStatus;
  setStatus: (s: StreamStatus) => void;
}
const S = createContext<StreamCtx>({ status: 'idle', setStatus: () => undefined });
export const useStreamStatus = () => useContext(S);
export const usePatient = () => useContext(C);

const KEY = 'unsaid.patient';

export function PatientProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const patients = me.data?.patients ?? [];
  const [id, setId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(KEY) ?? undefined;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    try {
      if (id) localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, [id]);
  const patient = patients.find((p) => p.id === id) ?? patients[0];
  const value = useMemo(() => ({ patients, patient, select: setId }), [patients, patient]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const stream = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <C.Provider value={value}>
      <S.Provider value={stream}>{children}</S.Provider>
    </C.Provider>
  );
}
