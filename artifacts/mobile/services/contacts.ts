import * as Contacts from "expo-contacts";

import { ADMIN_NUMBER } from "@/constants/admin";

export async function saveAdminContact(): Promise<void> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return;

  try {
    await Contacts.addContactAsync({
      contactType: Contacts.ContactTypes.Person,
      name: "Yash Motors Admin",
      firstName: "Yash Motors",
      lastName: "Admin",
      phoneNumbers: [
        { number: `+91${ADMIN_NUMBER}`, label: "mobile", isPrimary: true },
      ],
    });
  } catch {
    // Non-fatal — skip silently if contact already exists or permission changes
  }
}

export async function saveCustomerContact(
  vehicleNumber: string,
  phone: string,
  carModel: string,
  groupName: string,
  customerName?: string
): Promise<{ success: boolean; message: string; contactId?: string }> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") {
    return {
      success: false,
      message: "Contacts permission denied. Please enable in Settings.",
    };
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const formatted = cleanPhone.startsWith("91")
    ? `+${cleanPhone}`
    : `+91${cleanPhone}`;
  const plateDigits = vehicleNumber.replace(/\D/g, "").slice(-4) || vehicleNumber;
  const modelName = carModel.trim();

  const displayName = customerName?.trim()
    ? customerName.trim()
    : [plateDigits, modelName].filter(Boolean).join(" ");
  const [firstName, ...rest] = displayName.split(" ");
  const lastName = rest.join(" ") || modelName;

  const contact: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    name: displayName,
    firstName,
    lastName,
    phoneNumbers: [
      {
        number: formatted,
        label: "mobile",
        isPrimary: true,
      },
    ],
    note: `${carModel} | ${groupName}`,
  };

  try {
    const contactId = await Contacts.addContactAsync(contact);
    return { success: true, message: "Contact saved to phonebook.", contactId };
  } catch (error) {
    console.warn("Failed to save contact", error);
    return {
      success: false,
      message: "Failed to save contact. Please add manually.",
    };
  }
}
