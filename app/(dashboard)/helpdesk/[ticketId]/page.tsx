import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeByUserId } from "@/features/employees/queries";
import {
  CloseTicketButton,
  MarkTicketRead,
  ReplyBox,
  TicketControls,
} from "@/features/helpdesk/helpdesk-forms";
import { HELPDESK_GUIDE, HELPDESK_MIGRATION, isHelpdeskModuleReady } from "@/features/helpdesk/module";
import { getTicket, listAssignableUsers, listCategories, listMessages } from "@/features/helpdesk/queries";
import {
  hasUnreadReply,
  isFinished,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/features/helpdesk/rules";

export const metadata: Metadata = { title: "Detail Tiket" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * One ticket thread. The owner sees the public conversation; agents
 * (employees.view + employees.update) also see internal notes and manage
 * status, priority, category and assignee. Anyone else gets 404/403.
 */
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isHelpdeskModuleReady())) {
    return <ModuleNotReady module="Tanya Admin" migration={HELPDESK_MIGRATION} guide={HELPDESK_GUIDE} />;
  }
  if (!UUID.test(ticketId)) notFound();

  const ticket = await getTicket(organizationId, ticketId);
  if (!ticket) notFound();

  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const isAgentRole =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_UPDATE));
  const employee = await getEmployeeByUserId(user.id, organizationId);
  const isOwner = Boolean(employee && employee.id === ticket.employeeId);
  const isAgent = isAgentRole && !isOwner;
  if (!isOwner && !isAgent) forbidden();

  const [messages, categories, assignees] = await Promise.all([
    listMessages(organizationId, ticket.id, isAgent),
    isAgent ? listCategories(organizationId) : Promise.resolve([]),
    isAgent ? listAssignableUsers(organizationId) : Promise.resolve([]),
  ]);
  const finished = isFinished(ticket.status);

  return (
    <div className="space-y-5">
      {isOwner && hasUnreadReply(ticket) ? <MarkTicketRead ticketId={ticket.id} /> : null}

      <Link
        href={isAgent ? "/helpdesk/management" : "/helpdesk"}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <HrisIcon name="chevron-left" className="size-4" />
        {isAgent ? "Kelola tiket" : "Tiket saya"}
      </Link>

      <header className="hris-card rounded-[20px] border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight break-words">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAgent ? (
                <>
                  <Link href={`/employees/${ticket.employeeId}`} className="font-medium text-foreground hover:text-primary">
                    {ticket.employeeName}
                  </Link>{" "}
                  · {ticket.employeeNumber} ·{" "}
                </>
              ) : null}
              {ticket.categoryName ?? "Umum"} · dibuat {when.format(ticket.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${PRIORITY_COLORS[ticket.priority] ?? "#64748B"}1A`, color: PRIORITY_COLORS[ticket.priority] ?? "#64748B" }}
            >
              Prioritas {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            </span>
            <Badge variant={STATUS_BADGE[ticket.status] ?? "outline"}>{STATUS_LABELS[ticket.status] ?? ticket.status}</Badge>
            {isOwner && ticket.status !== "closed" ? <CloseTicketButton ticketId={ticket.id} /> : null}
          </div>
        </div>
        {isAgent && ticket.assigneeName ? (
          <p className="mt-2 text-xs text-muted-foreground">Petugas: {ticket.assigneeName}</p>
        ) : null}
      </header>

      <div className={cn("grid gap-5", isAgent && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0 space-y-4">
          <ol className="space-y-3" aria-label="Percakapan">
            {messages.map((m) => {
              const mine = isAgent ? m.fromAgent : !m.fromAgent;
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                      m.internal
                        ? "border border-dashed border-[#F59E0B] bg-[#FFF7E6] text-foreground dark:bg-[#3A2A10]"
                        : mine
                          ? "bg-primary text-primary-foreground"
                          : "hris-card border bg-card"
                    )}
                  >
                    <p className={cn("mb-1 text-[11.5px] font-semibold", mine && !m.internal ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {m.internal ? "Catatan internal · " : ""}
                      {m.fromAgent ? (m.authorName ?? "HR") : isAgent ? ticket.employeeName : "Anda"} · {when.format(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {ticket.status === "closed" && isOwner ? (
            <p className="text-center text-sm text-muted-foreground">
              Tiket ditutup. Kirim pesan baru untuk membuka kembali bila masalah belum selesai.
            </p>
          ) : null}
          <ReplyBox ticketId={ticket.id} agent={isAgent} finished={finished} />
        </div>

        {isAgent ? (
          <aside className="space-y-4">
            <TicketControls
              // Remount after every refresh so the selects never hold stale
              // values (a reply moves the status server-side).
              key={`${ticket.status}|${ticket.priority}|${ticket.categoryId}|${ticket.assignedTo}`}
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              categoryId={ticket.categoryId}
              assignedTo={ticket.assignedTo}
              categories={categories.map(({ id, name }) => ({ id, name }))}
              assignees={assignees}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
