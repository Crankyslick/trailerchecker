import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications, markNotificationRead, type NotificationRow } from "@/hooks/use-driver";

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = (notifications ?? []).filter((n) => !n.read_at);

  async function handleOpen(n: NotificationRow) {
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id);
      } catch {
        /* best-effort */
      }
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-md border border-border h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
        title="Notifications"
      >
        <Bell className="h-3.5 w-3.5" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 rounded-full bg-danger text-white text-[10px] leading-4 text-center">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl z-40">
            <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Notifications
            </div>
            {(notifications ?? []).length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing yet.
              </div>
            )}
            {(notifications ?? []).map((n) => (
              <button
                key={n.id}
                onClick={() => handleOpen(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-2/50 ${
                  n.read_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{n.title}</span>
                  {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                </div>
                {n.body && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {timeAgo(n.created_at)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
