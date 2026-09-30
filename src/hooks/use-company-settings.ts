import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readYardPolicy,
  saveYardPolicy,
  readBusinessModel,
  saveBusinessModel,
} from "@/lib/company-settings";
import { YARD_POLICY, setActiveYardPolicy, type YardPolicy } from "@/lib/loads";
import type { BusinessModel } from "@/lib/brokerage";

/**
 * The company's yard turnaround policy. Every screen that colours or counts
 * yard time reads it from here, so Settings and the boards always agree.
 * Once loaded it is also published to the shared aging helpers, so plain
 * functions (yardTier/yardBadge) use the same numbers without prop drilling.
 */
export function useYardPolicy() {
  const query = useQuery({
    queryKey: ["company-settings", "yard-policy"],
    queryFn: readYardPolicy,
    staleTime: 60_000,
  });
  const policy = (query.data ?? YARD_POLICY) as YardPolicy;

  useEffect(() => {
    setActiveYardPolicy(policy);
  }, [policy.deadlineHours, policy.criticalHours]);

  return {
    policy,
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

export function useBusinessModel() {
  const query = useQuery({
    queryKey: ["company-settings", "business-model"],
    queryFn: readBusinessModel,
    staleTime: 60_000,
  });
  return {
    model: query.data ?? "ASSET_BASED_3PL",
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

export function useSaveBusinessModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: BusinessModel) => saveBusinessModel(model),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-settings"] }),
  });
}
