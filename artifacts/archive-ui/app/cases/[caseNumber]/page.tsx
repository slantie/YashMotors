import { requireSession } from "@/lib/session";
import { getCaseDetail } from "@/lib/actions";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Car,
  Phone,
  User,
  Trash2,
  MessageCircle,
  Clock,
  Briefcase,
  CreditCard,
  Image as ImageIcon,
  Camera,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ImageGallery } from "@/components/image-gallery";
import { Timeline } from "@/components/timeline";
import { LogoutButton } from "@/components/logout-button";
import { DownloadButton } from "@/components/download-button";
import { CopyButton } from "@/components/copy-button";
import { Footer } from "@/components/footer";
import { StatusPill, InfoCard, EmptyMediaState } from "@/lib/shared";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseNumber: string }>;
}) {
  const { caseNumber } = await params;
  return { title: `${caseNumber} — Yash Motors Archive` };
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseNumber: string }>;
}) {
  await requireSession();
  const { caseNumber } = await params;
  const data = await getCaseDetail(caseNumber);
  if (!data) notFound();

  const { case: c, advisor, events, images } = data;
  const intakeImages = images.filter((i) => i.folder === "intake");
  const repairImages = images.filter((i) => i.folder === "repairs");
  const totalImages = images.length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Subtle top nav */}
      <header className="bg-white/80 backdrop-blur-md border-b border-border px-6 lg:px-10 py-3 flex items-center gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/archive/logo.svg"
              width={26}
              height={26}
              alt="Yash Motors"
            />
          </div>
          <div className="leading-tight hidden sm:block">
            <p className="font-bold text-foreground text-sm tracking-tight">
              Yash Motors
            </p>
            <p className="text-[11px] text-muted-foreground font-medium">
              Case Archive
            </p>
          </div>
        </div>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <Link href="/cases">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All Cases
          </Button>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-3 shrink-0">
          <DownloadButton caseNumber={c.caseNumber} />
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero - Compact & Dense */}
        <div className="bg-white border-b border-border shadow-sm shadow-black/[0.01]">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 lg:py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-secondary px-2.5 py-1 rounded-md border border-border/60">
                    <Briefcase className="h-3 w-3" />
                    {c.caseNumber}
                    <CopyButton text={c.caseNumber} />
                  </span>
                  {c.deletedAt && (
                    <Badge variant="destructive" className="gap-1">
                      <Trash2 className="h-3 w-3" />
                      Deleted {format(new Date(c.deletedAt), "dd MMM yyyy")}
                    </Badge>
                  )}
                </div>

                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
                    {c.vehicleNumber}
                  </h1>
                  {(c.carModel || c.kmCount) && (
                    <p className="text-sm lg:text-base text-muted-foreground font-medium">
                      {c.carModel}
                      {c.carModel && c.kmCount && " • "}
                      {c.kmCount && `${c.kmCount.toLocaleString()} km`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={c.internalStatus} />
                <StatusPill status={c.customerStatus} />
                {c.serviceType && <StatusPill status={c.serviceType} />}
                {c.serviceSubType && <StatusPill status={c.serviceSubType} />}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 space-y-6">
          {/* Top Info Grid */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              <InfoCard icon={User} label="Customer">
                <p className="text-sm font-semibold text-foreground">
                  {c.customerName ?? "—"}
                </p>
                {c.customerPhone ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{c.customerPhone}</span>
                    <CopyButton text={c.customerPhone} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No phone</p>
                )}
                {c.customerArrivalStatus && (
                  <div className="mt-1">
                    <StatusPill status={c.customerArrivalStatus} />
                  </div>
                )}
              </InfoCard>

              <InfoCard icon={Calendar} label="Case Details">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(c.createdAt), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Advisor</span>
                  <span className="font-medium text-foreground text-right line-clamp-1">
                    {advisor?.name ?? "—"}
                  </span>
                </div>
                {c.dueDate && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Due</span>
                    <span className="font-medium text-orange-700">
                      {c.dueDate}
                    </span>
                  </div>
                )}
              </InfoCard>

              <InfoCard icon={MessageCircle} label="Communication">
                {c.whatsappStatus ? (
                  <>
                    <div className="flex items-center gap-2">
                      <StatusPill status={c.whatsappStatus} />
                    </div>
                    {c.whatsappInviteLink && (
                      <a
                        href={c.whatsappInviteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        Open group
                        <ArrowLeft className="h-3 w-3 rotate-180" />
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No WhatsApp group
                  </p>
                )}
              </InfoCard>
            </div>
          </section>

          {/* Notes (Spans full width above columns to prevent misalignment) */}
          {c.notes && (
            <section className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 lg:p-5 shadow-sm shadow-black/[0.01]">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                  Notes
                </h2>
              </div>
              <p className="text-sm text-amber-900/90 leading-relaxed whitespace-pre-wrap">
                {c.notes}
              </p>
            </section>
          )}

          {/* Side-by-Side Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column: Timeline */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col w-full">
              {/* Forced 40px Height Header for perfect alignment */}
              <div className="flex items-center justify-between mb-4 h-10 w-full shrink-0">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Timeline
                </h2>
                <span className="text-xs text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-md border border-border/60">
                  {events.length} {events.length === 1 ? "event" : "events"}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-border/60 p-5 lg:p-6 shadow-sm shadow-black/[0.01] max-h-[600px] xl:max-h-[700px] overflow-y-auto">
                <Timeline events={events} />
              </div>
            </div>

            {/* Right Column: Media Section */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col w-full">
              <Tabs defaultValue="intake" className="w-full flex flex-col">
                {/* Forced 40px Height Header for perfect alignment */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0 mb-4 sm:h-10 w-full shrink-0">
                  <div className="flex items-center gap-3 shrink-0">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2 whitespace-nowrap">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      Media Gallery
                    </h2>
                    <span className="text-xs text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-md border border-border/60 shrink-0">
                      {totalImages} {totalImages === 1 ? "file" : "files"}
                    </span>
                  </div>

                  {totalImages > 0 && (
                    <TabsList className="bg-secondary/50 p-1 rounded-lg h-9 flex shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
                      <TabsTrigger
                        value="intake"
                        className="rounded-md text-sm font-medium px-4 py-1 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 transition-all flex items-center gap-2 whitespace-nowrap h-full"
                      >
                        Intake
                        <span className="py-0.5 px-1.5 bg-muted/50 rounded-md text-[10px] leading-none text-muted-foreground font-semibold">
                          {intakeImages.length}
                        </span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="repairs"
                        className="rounded-md text-sm font-medium px-4 py-1 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 transition-all flex items-center gap-2 whitespace-nowrap h-full"
                      >
                        Repairs
                        <span className="py-0.5 px-1.5 bg-muted/50 rounded-md text-[10px] leading-none text-muted-foreground font-semibold">
                          {repairImages.length}
                        </span>
                      </TabsTrigger>
                    </TabsList>
                  )}
                </div>

                <div className="w-full">
                  {totalImages === 0 ? (
                    <div className="bg-white rounded-xl border border-dashed border-border/80 flex flex-col items-center justify-center p-12 text-center shadow-sm shadow-black/[0.01] w-full">
                      <div className="w-14 h-14 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                        <Camera className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">
                        No media attached
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        There are no intake or repair images associated with
                        this case yet.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-border/60 shadow-sm shadow-black/[0.01] overflow-hidden w-full">
                      <TabsContent
                        value="intake"
                        className="m-0 focus-visible:outline-none w-full"
                      >
                        {intakeImages.length > 0 ? (
                          <div className="p-4 sm:p-6 w-full">
                            <ImageGallery images={intakeImages} />
                          </div>
                        ) : (
                          <EmptyMediaState type="intake" />
                        )}
                      </TabsContent>

                      <TabsContent
                        value="repairs"
                        className="m-0 focus-visible:outline-none w-full"
                      >
                        {repairImages.length > 0 ? (
                          <div className="p-4 sm:p-6 w-full">
                            <ImageGallery images={repairImages} />
                          </div>
                        ) : (
                          <EmptyMediaState type="repair" />
                        )}
                      </TabsContent>
                    </div>
                  )}
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
