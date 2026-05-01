// Polls the list of fine-tune jobs for a specialist. Polls every 4s while
// any job is non-terminal (queued / training / delivered), idle otherwise.

import { useCallback, useEffect, useState } from 'react';
import { finetuneApi } from '../lib/api.js';

const TERMINAL = new Set(['live', 'failed']);

export function useSpecialistJobs(specialistId) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!specialistId) return;
    setError(null);
    try {
      const res = await finetuneApi.listForSpecialist(specialistId);
      setJobs(res.jobs ?? []);
    } catch (err) {
      setError(err.message ?? 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, [specialistId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Poll while any job is non-terminal.
  useEffect(() => {
    const hasActive = jobs.some((j) => !TERMINAL.has(j.status));
    if (!hasActive) return undefined;
    const t = setInterval(refetch, 4000);
    return () => clearInterval(t);
  }, [jobs, refetch]);

  const currentJob = jobs.find((j) => !TERMINAL.has(j.status)) ?? null;
  return { jobs, currentJob, loading, error, refetch };
}
