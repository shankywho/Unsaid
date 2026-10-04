import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, unwrap } from './client';

export const keys = {
  me: ['me'] as const,
  omi: (u?: string) => ['omi', u] as const,
  segments: (u?: string) => ['segments', u] as const,
  memory: (u?: string, q?: string) => ['memory', u, q ?? ''] as const,
  wordmap: (u?: string) => ['wordmap', u] as const,
  insights: (u?: string) => ['insights', u] as const,
  runs: (u?: string) => ['runs', u] as const,
  run: (id?: string) => ['run', id] as const,
};

export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: () => unwrap(client.GET('/v1/me')).then((r) => r.data),
    retry: false,
  });

export const useOmiStatus = (userId?: string) =>
  useQuery({
    queryKey: keys.omi(userId),
    enabled: !!userId,
    refetchInterval: 10_000,
    queryFn: () =>
      unwrap(client.GET('/v1/omi/status', { params: { query: { userId } } })).then((r) => r.data),
  });

export const useSegments = (userId?: string) =>
  useQuery({
    queryKey: keys.segments(userId),
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: () =>
      unwrap(client.GET('/v1/segments', { params: { query: { userId: userId!, limit: 40 } } })).then(
        (r) => r.data,
      ),
  });

export const useSegmentsByKey = (userId: string | undefined, ids: string[]) =>
  useQuery({
    queryKey: ['segments-by-key', userId, ids.join(',')],
    enabled: !!userId && ids.length > 0,
    staleTime: 60_000,
    queryFn: () =>
      unwrap(client.GET('/v1/segments', { params: { query: { userId: userId!, ids: ids.join(',') } } })).then(
        (r) => r.data,
      ),
  });

export const useMemoryFacts = (userId?: string, q?: string) =>
  useQuery({
    queryKey: keys.memory(userId, q),
    enabled: !!userId,
    queryFn: () =>
      unwrap(client.GET('/v1/memory', { params: { query: { userId: userId!, ...(q ? { q } : {}) } } })).then(
        (r) => r.data,
      ),
  });

export const useWordMap = (userId?: string) =>
  useQuery({
    queryKey: keys.wordmap(userId),
    enabled: !!userId,
    queryFn: () =>
      unwrap(client.GET('/v1/users/{id}/wordmap', { params: { path: { id: userId! } } })).then((r) => r.data),
  });

export const useInsights = (userId?: string) =>
  useQuery({
    queryKey: keys.insights(userId),
    enabled: !!userId,
    queryFn: () =>
      unwrap(client.GET('/v1/users/{id}/insights', { params: { path: { id: userId! } } })).then(
        (r) => r.data,
      ),
  });

export const useRuns = (userId?: string) =>
  useQuery({
    queryKey: keys.runs(userId),
    enabled: !!userId,
    queryFn: () =>
      unwrap(client.GET('/v1/runs', { params: { query: { userId, limit: 40 } } })).then((r) => r.data),
  });

export const useRun = (id?: string) =>
  useQuery({
    queryKey: keys.run(id),
    enabled: !!id,
    queryFn: () => unwrap(client.GET('/v1/runs/{id}', { params: { path: { id: id! } } })).then((r) => r.data),
  });

export function useDeleteFact(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pointId: string) =>
      unwrap(
        client.DELETE('/v1/memory/{pointId}', { params: { path: { pointId }, query: { userId: userId! } } }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory', userId] }),
  });
}

export function usePurge(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST('/v1/memory/purge', { body: { userId: userId! } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory', userId] });
      qc.invalidateQueries({ queryKey: keys.wordmap(userId) });
    },
  });
}

export function useSetContext(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contextEnabled: boolean) =>
      unwrap(client.PATCH('/v1/users/{id}', { params: { path: { id: userId! } }, body: { contextEnabled } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useSimulateFragment() {
  return useMutation({
    mutationFn: (v: { userId: string; text: string }) =>
      unwrap(client.POST('/v1/simulate/fragment', { body: v })),
  });
}

export function useAnswer() {
  return useMutation({
    mutationFn: (v: { id: string; answer: 'yes' | 'no' }) =>
      unwrap(
        client.POST('/v1/confirmations/{id}/answer', {
          params: { path: { id: v.id } },
          body: { answer: v.answer },
        }),
      ),
  });
}
