import { useQuery } from "@tanstack/react-query";

import { fetchWhatsAppStatus } from "@/services/whatsapp";

export function useWhatsAppStatus(caseNumber: string, enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-status", caseNumber],
    queryFn: () => fetchWhatsAppStatus(caseNumber),
    enabled: !!caseNumber && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.whatsappStatus;
      if (status === "pending" || status === "retrying") return 4000;
      return false;
    },
  });
}
