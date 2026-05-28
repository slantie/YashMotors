"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Star, ImageOff, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCw, X } from "lucide-react";
import { format } from "date-fns";

type MediaItem = { id: number; filename: string; mediaType: string; isPrimary: boolean; url: string; createdAt: Date; };

export function ImageGallery({ images }: { images: MediaItem[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const selected = selectedIdx !== null ? images[selectedIdx] : null;

  const resetView = useCallback(() => { setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); }, []);
  const prev = useCallback((e?: React.MouseEvent) => { e?.stopPropagation(); setSelectedIdx((i) => (i !== null ? (i - 1 + images.length) % images.length : null)); resetView(); }, [images.length, resetView]);
  const next = useCallback((e?: React.MouseEvent) => { e?.stopPropagation(); setSelectedIdx((i) => (i !== null ? (i + 1) % images.length : null)); resetView(); }, [images.length, resetView]);

  useEffect(() => {
    if (selectedIdx === null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") prev(); else if (e.key === "ArrowRight") next(); else if (e.key === "Escape") setSelectedIdx(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIdx, prev, next]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));
  const handleRotate = () => setRotation((r) => r + 90);
  const handleMouseDown = (e: React.MouseEvent) => { if (scale <= 1 || !imageRef.current) return; e.preventDefault(); setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }); };
  const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp = () => setIsDragging(false);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full py-16 text-muted-foreground gap-4 bg-secondary/20 rounded-xl border border-dashed border-border/60">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-sm">
          <ImageOff className="h-8 w-8 opacity-40" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">No media available</p>
          <p className="text-xs text-muted-foreground/80">Upload media to view it here.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => { setSelectedIdx(i); resetView(); }} className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border/80 bg-secondary hover:border-primary/50 hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/30">
            {img.mediaType === "video" || !img.url ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-secondary">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all"><Play className="h-4 w-4 text-primary fill-primary" /></div>
                <span className="text-[10px] font-medium text-muted-foreground px-3 truncate w-full text-center">{img.filename}</span>
              </div>
            ) : (
              <><img src={img.url} alt={img.filename} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out" loading="lazy" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-300" /></>
            )}
            {img.isPrimary && <div className="absolute top-2 left-2 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm flex items-center gap-1 z-10"><Star className="h-3 w-3 fill-white" />Primary</div>}
            {img.mediaType === "video" && img.url && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center group-hover:bg-primary/90 group-hover:scale-110 transition-all duration-300 shadow-xl"><Play className="h-5 w-5 text-white fill-white ml-0.5" /></div></div>}
          </button>
        ))}
      </div>
      <Dialog open={selectedIdx !== null} onOpenChange={(open) => { if (!open) setSelectedIdx(null); }}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 overflow-hidden rounded-2xl border border-white/10 bg-black/95 text-white shadow-2xl flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Media Preview</DialogTitle>
          {selected && (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-black/40 z-50 border-b border-white/10 absolute top-0 left-0 right-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold truncate max-w-[200px] md:max-w-md">{selected.filename}</span>
                  <Badge variant="outline" className="text-[10px] uppercase border-white/20 text-white/70 bg-white/5 py-0">{selected.mediaType}</Badge>
                  {selected.isPrimary && <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0 text-[10px] py-0 px-1.5 flex items-center gap-1"><Star className="h-3 w-3 fill-white" />Primary</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/50 bg-white/10 px-2.5 py-1 rounded-full tabular-nums">{(selectedIdx ?? 0) + 1} / {images.length}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/20 rounded-full" onClick={() => setSelectedIdx(null)}><X className="h-5 w-5" /></Button>
                </div>
              </div>
              <div className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full mt-12 mb-16" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                {selected.mediaType === "video" ? (
                  <video src={selected.url} controls className="max-h-full max-w-full rounded-lg shadow-2xl z-10 px-4 py-4" />
                ) : selected.url ? (
                  <div className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing p-4">
                    <img ref={imageRef} src={selected.url} alt={selected.filename} style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`, transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1)" }} className="max-h-full max-w-full object-contain pointer-events-none select-none drop-shadow-2xl" draggable="false" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white/40"><ImageOff className="h-16 w-16 opacity-50" /><p className="text-sm font-medium">Media unavailable</p></div>
                )}
                {images.length > 1 && (
                  <>
                    <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/10" aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>
                    <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/10" aria-label="Next"><ChevronRight className="h-6 w-6" /></button>
                  </>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center z-50 pointer-events-none">
                <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/60 border border-white/10 pointer-events-auto shadow-2xl">
                  {selected.mediaType === "image" && (
                    <>
                      <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-9 w-9 rounded-xl text-white/70 hover:text-white hover:bg-white/20" title="Zoom Out"><ZoomOut className="h-4 w-4" /></Button>
                      <div className="w-10 text-center text-[11px] font-medium text-white/90 tabular-nums">{Math.round(scale * 100)}%</div>
                      <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-9 w-9 rounded-xl text-white/70 hover:text-white hover:bg-white/20" title="Zoom In"><ZoomIn className="h-4 w-4" /></Button>
                      <div className="w-px h-5 bg-white/20 mx-1" />
                      <Button variant="ghost" size="icon" onClick={handleRotate} className="h-9 w-9 rounded-xl text-white/70 hover:text-white hover:bg-white/20" title="Rotate"><RotateCw className="h-4 w-4" /></Button>
                      <div className="w-px h-5 bg-white/20 mx-1" />
                    </>
                  )}
                  {selected.url && (
                    <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl text-white/70 hover:text-white hover:bg-white/20" title="Download">
                      <a href={selected.url} download={selected.filename} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
