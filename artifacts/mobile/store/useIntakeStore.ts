import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DeliveryType } from "@/components/DeliveryTypeSelector";
import type { DueDateOption } from "@/components/DueDateSelector";

export interface IntakeFormData {
  primaryImage: string | null;
  additionalImages: string[];
  carModel: string;
  customerName: string;
  contactNumber: string;
  kmCount: string;
  dueDate: DueDateOption | "";
  deliveryType: DeliveryType | "";
  notes: string;
}

interface IntakeStore {
  formData: IntakeFormData;
  vehicleNumber: string;
  selectedSharingImages: string[];
  hydrated: boolean;
  setFormData: (data: Partial<IntakeFormData>) => void;
  setVehicleNumber: (vn: string) => void;
  setSelectedSharingImages: (images: string[]) => void;
  setHydrated: (v: boolean) => void;
  reset: () => void;
}

const defaultFormData: IntakeFormData = {
  primaryImage: null,
  additionalImages: [],
  carModel: "",
  customerName: "",
  contactNumber: "",
  kmCount: "",
  dueDate: "",
  deliveryType: "",
  notes: "",
};

export const useIntakeStore = create<IntakeStore>()(
  persist(
    (set) => ({
      formData: defaultFormData,
      vehicleNumber: "GJ01AB1234",
      selectedSharingImages: [],
      hydrated: false,
      setFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setVehicleNumber: (vehicleNumber) => set({ vehicleNumber }),
      setSelectedSharingImages: (selectedSharingImages) =>
        set({ selectedSharingImages }),
      setHydrated: (hydrated) => set({ hydrated }),
      reset: () =>
        set({
          formData: defaultFormData,
          vehicleNumber: "GJ01AB1234",
          selectedSharingImages: [],
        }),
    }),
    {
      name: "Yash Motors App-intake-v1",
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist selectedSharingImages — it's transient
      partialize: (state) => ({
        formData: state.formData,
        vehicleNumber: state.vehicleNumber,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
