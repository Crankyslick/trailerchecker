import { useMemo } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  usePlanningLegs,
  createTender,
  respondToTender,
  useCarriers,
  type PlanningLeg,
  type TenderStatus,
} from "@/hooks/use-orders";

// Re-exported under the requested name: same underlying legs+loads+tenders
// query used by Load Planning, not a second parallel data path. Its own
// realtime subscriptions (legs/loads/tenders) already keep it fresh, so
// nothing here polls or manually syncs state.
export { useCarriers, usePlanningLegs as useLoadsForTendering };
export type { PlanningLeg, TenderStatus };

/** Buckets every leg into the three tendering workflow columns. */
export function useTenderBoard() {
  const query = usePlanningLegs();

  const columns = useMemo(() => {
    const legs = query.data ?? [];
    const notTendered: PlanningLeg[] = [];
    const pending: PlanningLeg[] = [];
    const resolved: PlanningLeg[] = [];

    for (const leg of legs) {
      const load = leg.loads?.[0];
      const latestTender = [...(leg.tenders ?? [])].sort(
        (a, b) => new Date(b.offered_at).getTime() - new Date(a.offered_at).getTime(),
      )[0];

      if (load?.driver_id) continue; // own-fleet dispatched — not a tendering concern here

      if (
        !latestTender ||
        latestTender.status === "REJECTED" ||
        latestTender.status === "EXPIRED" ||
        latestTender.status === "RESCINDED"
      ) {
        if (!load?.carrier_id) notTendered.push(leg);
        else resolved.push(leg); // carrier assigned but no live tender record — treat as resolved/accepted
      } else if (latestTender.status === "OFFERED") {
        pending.push(leg);
      } else {
        resolved.push(leg); // ACCEPTED
      }
    }

    return { notTendered, pending, resolved };
  }, [query.data]);

  return { ...query, ...columns };
}

/** The most recent tender for a leg, if any, plus a convenience accept/reject flag. */
export function useTenderStatus(leg: PlanningLeg) {
  return useMemo(() => {
    const latest = [...(leg.tenders ?? [])].sort(
      (a, b) => new Date(b.offered_at).getTime() - new Date(a.offered_at).getTime(),
    )[0];
    return {
      tender: latest ?? null,
      status: (latest?.status ?? null) as TenderStatus | null,
      canRetender:
        !latest ||
        latest.status === "REJECTED" ||
        latest.status === "EXPIRED" ||
        latest.status === "RESCINDED",
    };
  }, [leg]);
}

export function useCreateTender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { legId: string; carrierId: string; offeredRate: number | null }) =>
      createTender(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["legs", "planning"] });
    },
  });
}

export function useRespondToTender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tenderId: string; response: "ACCEPTED" | "REJECTED" }) =>
      respondToTender(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["legs", "planning"] });
    },
  });
}
