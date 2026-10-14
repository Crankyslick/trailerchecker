import { createFileRoute } from "@tanstack/react-router";
import { ShieldQuestion } from "lucide-react";

export const Route = createFileRoute("/_authenticated/no-access")({
  head: () => ({ meta: [{ title: "No screens yet — Me Do Logistics" }] }),
  component: NoAccessPage,
});

function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <ShieldQuestion className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">Nothing to show yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account doesn't have a role or product that opens any screens. Ask your organization's
        admin to give you a role on the Users page, or to check the subscription in Settings.
      </p>
    </div>
  );
}
