export function Footer() {
  return (
    <footer className="border-t border-border bg-white mt-8 px-6 lg:px-10 py-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground/80">Yash Motors</span>
          <span className="text-border">·</span>
          <span>Case Archive Portal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Developed by</span>
          <a
            href="https://slantie.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Kandarp Gajjar
          </a>
        </div>
      </div>
    </footer>
  );
}
