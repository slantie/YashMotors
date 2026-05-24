import { useQuery } from "@tanstack/react-query";

import { fetchImages } from "@/services/caseEvents";

export function useCaseImages(caseNumber: string, folder: string) {
  return useQuery({
    queryKey: ["images", caseNumber, folder],
    queryFn: () => fetchImages(caseNumber, folder),
    enabled: !!caseNumber,
    staleTime: 10 * 60 * 1000,
  });
}
