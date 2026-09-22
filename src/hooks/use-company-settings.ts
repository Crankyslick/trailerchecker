import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readYardPolicy, saveYardPolicy } from "@/lib/company-settings";
import { YARD_POLICY, type YardPolicy } from "@/lib/loads";

/**
 * The company's yard turnaround policy. Every screen that colours or counts
 * yard time reads it from here, so Settings and the boards always agree.
 */
export function useYardPolicy() {
  const query = useQuery({
    queryKey: ["company-settings", "yard-policy"],
    queryFn: readYardPolicy,
    staleTime: 60_000,
  });
  return {
    policy: (query.data ?? YARD_POLICY) as YardPolicy,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

export function useSaveYardPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: YardPolicy) => saveYardPolicy(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-settings"] }),
  });
}
