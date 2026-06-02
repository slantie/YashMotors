import { useQuery } from "@tanstack/react-query";

import { fetchImages } from "@/services/caseEvents";

export function useCaseImages(caseNumber: string, folder: string) {
  return useQuery({
    queryKey: ["images", caseNumber, folder],
    queryFn: () => fetchImages(caseNumber, folder),
    enabled: !!caseNumber,
    // 30s keeps Intake/Repair tab switches instant (no flicker) while staying fresh.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
