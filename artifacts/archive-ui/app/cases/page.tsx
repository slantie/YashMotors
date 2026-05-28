import { requireSession } from "@/lib/session";
import {
  getCases,
  getStats,
  type SortField,
  type SortDir,
} from "@/lib/actions";
import { StatusPill, STATUS_LABELS } from "@/lib/shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Trash2,
  Database,
  CheckCircle2,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { LogoutButton } from "@/components/logout-button";
import { Footer } from "@/components/footer";

function buildPageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const range: (number | "...")[] = [1];
  if (left > 2) range.push("...");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("...");
  range.push(total);
  return range;
}

function sortLink(
  p: { q: string; status: string; sort: string; dir: string },
  field: SortField,
) {
  const newDir: SortDir = p.sort === field && p.dir === "desc" ? "asc" : "desc";
  return `/cases?${new URLSearchParams({ q: p.q, status: p.status, page: "1", sort: field, dir: newDir })}`;
}

function pageLink(
  p: { q: string; status: string; sort: string; dir: string },
  page: number,
) {
  return `/cases?${new URLSearchParams({ q: p.q, status: p.status, page: String(page), sort: p.sort, dir: p.dir })}`;
}

function SortIcon({
  field,
  current,
  dir,
}: {
  field: string;
  current: string;
  dir: string;
}) {
  if (current !== field)
    return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3 ml-1 text-primary inline" />
  ) : (
    <ChevronDown className="h-3 w-3 ml-1 text-primary inline" />
  );
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
    status?: string;
  }>;
}) {
  await requireSession();

  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Number(sp.page ?? "1");
  const sort = (sp.sort ?? "createdAt") as SortField;
  const dir = (sp.dir ?? "desc") as SortDir;
  const status = sp.status ?? "";
  const p = { q, status, sort, dir };

  const [{ rows, total, pageSize }, stats] = await Promise.all([
    getCases(q, page, sort, dir, status),
    getStats(),
  ]);
  const totalPages = Math.ceil(total / pageSize);
  const isFiltered = !!(q || status);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 lg:px-10 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/archive/logo.svg"
              width={30}
              height={30}
              alt="Yash Motors"
            />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-foreground text-sm">Yash Motors</p>
            <p className="text-xs text-muted-foreground">Case Archive</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-1 px-6 lg:px-10 py-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out-expo fill-mode-both">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Total Cases",
              value: stats.total,
              valueColor: "text-foreground",
              icon: Database,
              iconBg: "bg-primary/10",
              iconColor: "text-primary",
            },
            {
              label: "Active",
              value: stats.active,
              valueColor: "text-green-700",
              icon: CheckCircle2,
              iconBg: "bg-green-100",
              iconColor: "text-green-600",
            },
            {
              label: "Deleted",
              value: stats.deleted,
              valueColor: "text-red-600",
              icon: Trash,
              iconBg: "bg-red-50",
              iconColor: "text-red-500",
            },
          ].map(
            ({ label, value, valueColor, icon: Icon, iconBg, iconColor }) => (
              <div
                key={label}
                className="bg-white rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow duration-300 ease-out-expo flex items-center gap-4"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}
                >
                  <Icon className={`h-6 w-6 ${iconColor}`} />
                </div>
                <div>
                  <p
                    className={`text-3xl font-bold tracking-tight leading-none ${valueColor}`}
                  >
                    {value.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1.5 font-medium">
                    {label}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>

        {/* Search + filter */}
        <form className="flex flex-wrap gap-3 items-center bg-white p-2 rounded-xl border border-border shadow-sm">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search case #, vehicle, customer…"
              className="pl-10 h-10 border-0 shadow-none focus-visible:ring-0 text-base"
            />
          </div>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={status}
            className="h-10 rounded-lg border-0 bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-0 cursor-pointer min-w-[140px]"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            size="default"
            className="font-semibold shadow-sm rounded-lg px-6 h-10 bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 active:scale-95"
          >
            Search
          </Button>
          {isFiltered && (
            <Link href="/cases">
              <Button
                type="button"
                variant="ghost"
                size="default"
                className="h-10 text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            </Link>
          )}
        </form>

        {/* Filters status message */}
        {isFiltered && (
          <div className="text-sm font-medium text-muted-foreground px-1">
            Found {total.toLocaleString()} case{total !== 1 ? "s" : ""} matching
            your criteria.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden transition-all duration-300">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 hover:bg-secondary/40 border-b-border">
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  <Link
                    href={sortLink(p, "caseNumber")}
                    className="hover:text-primary flex items-center transition-colors"
                  >
                    Case #{" "}
                    <SortIcon field="caseNumber" current={sort} dir={dir} />
                  </Link>
                </TableHead>
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  <Link
                    href={sortLink(p, "vehicleNumber")}
                    className="hover:text-primary flex items-center transition-colors"
                  >
                    Vehicle{" "}
                    <SortIcon field="vehicleNumber" current={sort} dir={dir} />
                  </Link>
                </TableHead>
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  Customer
                </TableHead>
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  Advisor
                </TableHead>
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  <Link
                    href={sortLink(p, "internalStatus")}
                    className="hover:text-primary flex items-center transition-colors"
                  >
                    Status{" "}
                    <SortIcon field="internalStatus" current={sort} dir={dir} />
                  </Link>
                </TableHead>
                <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider h-12">
                  <Link
                    href={sortLink(p, "createdAt")}
                    className="hover:text-primary flex items-center transition-colors"
                  >
                    Created{" "}
                    <SortIcon field="createdAt" current={sort} dir={dir} />
                  </Link>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-20 text-sm"
                  >
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/30" />
                      <p>No cases found matching your search.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className={`group hover:bg-muted/50 transition-colors duration-200 ${c.deletedAt ? "opacity-55" : ""}`}
                >
                  <TableCell className="py-4">
                    <Link
                      href={`/cases/${c.caseNumber}`}
                      className="font-semibold text-primary group-hover:text-primary/80 transition-colors flex items-center gap-2"
                    >
                      {c.caseNumber}
                      {c.deletedAt && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-600 text-[10px] font-semibold">
                          <Trash2 className="h-2.5 w-2.5" /> Deleted
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="font-semibold text-sm">{c.vehicleNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.carModel}
                    </p>
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="text-sm font-medium">
                      {c.customerName ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.customerPhone ?? ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground py-4">
                    {c.advisorName ?? "—"}
                  </TableCell>
                  <TableCell className="py-4">
                    <StatusPill status={c.internalStatus} />
                  </TableCell>
                  <TableCell className="py-4">
                    <p className="text-sm text-foreground font-medium">
                      {format(new Date(c.createdAt), "dd MMM yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(c.createdAt), "HH:mm")}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total === 0 ? (
              "No records"
            ) : (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {((page - 1) * pageSize + 1).toLocaleString()}–
                  {Math.min(page * pageSize, total).toLocaleString()}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {total.toLocaleString()}
                </span>{" "}
                cases
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Link
                href={pageLink(p, page - 1)}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className="gap-1 h-8"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </Link>
              {buildPageRange(page, totalPages).map((item, i) =>
                item === "..." ? (
                  <span
                    key={`e${i}`}
                    className="w-8 text-center text-muted-foreground text-sm select-none"
                  >
                    …
                  </span>
                ) : (
                  <Link key={item} href={pageLink(p, item as number)}>
                    <button
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        item === page
                          ? "bg-primary text-white"
                          : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      {item}
                    </button>
                  </Link>
                ),
              )}
              <Link
                href={pageLink(p, page + 1)}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  className="gap-1 h-8"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
