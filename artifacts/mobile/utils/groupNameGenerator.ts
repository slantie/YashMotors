export function generateGroupName(
  vehicleNumber: string,
  carModel: string
): string {
  const vn = vehicleNumber?.trim().toUpperCase() || "UNKNOWN";
  const model = carModel?.trim() || "Unknown Model";
  return `${vn} | ${model}`;
}
