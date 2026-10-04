import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMe } from '../api/hooks';

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
  return <C.Provider value={value}>{children}</C.Provider>;
}
