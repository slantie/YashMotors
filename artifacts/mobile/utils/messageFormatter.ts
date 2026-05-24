import { IntakeFormData } from "../store/useIntakeStore";
import type { CaseDetail } from "../services/cases";

function intakeTimestamp(): { dateStr: string; timeStr: string } {
  const now = new Date();
  return {
    dateStr: now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    timeStr: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function formatIntakeMessage(
  vehicleNumber: string,
  formData: IntakeFormData
): string {
  const { dateStr, timeStr } = intakeTimestamp();

  const lines: string[] = [
    "*Vehicle Received Successfully* ✅",
    "",
    `*Vehicle No:* ${vehicleNumber?.toUpperCase() || "N/A"}`,
    `*Model:* ${formData.carModel || "N/A"}`,
    `*Customer:* ${formData.contactNumber || "N/A"}`,
    `*KM Count:* ${formData.kmCount ? `${formData.kmCount} km` : "N/A"}`,
  ];

  if (formData.dueDate) lines.push(`*Due Date:* ${formData.dueDate}`);
  if (formData.notes) lines.push(`*Notes:* ${formData.notes}`);

  lines.push("");
  lines.push(`*Received:* ${dateStr} at ${timeStr}`);

  return lines.join("\n");
}

export function formatCaseMessage(data: CaseDetail): string {
  const { dateStr, timeStr } = intakeTimestamp();

  const lines: string[] = [
    "*Vehicle Received Successfully* ✅",
    "",
    `*Vehicle No:* ${data.vehicleNumber.toUpperCase()}`,
    `*Model:* ${data.carModel}`,
  ];

  if (data.kmCount) lines.push(`*KM Count:* ${data.kmCount} km`);
  if (data.dueDate) lines.push(`*Due Date:* ${data.dueDate}`);
  if (data.deliveryType) lines.push(`*Delivery:* ${data.deliveryType}`);
  if (data.notes) lines.push(`*Notes:* ${data.notes}`);

  lines.push("");
  lines.push(`*Received:* ${dateStr} at ${timeStr}`);

  return lines.join("\n");
}
