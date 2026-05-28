import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
          <FileQuestion className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          <p className="text-muted-foreground text-sm mt-1">
            That case or page doesn't exist.
          </p>
        </div>
        <Link href="/cases">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Cases
          </Button>
        </Link>
      </div>
    </div>
  );
}
