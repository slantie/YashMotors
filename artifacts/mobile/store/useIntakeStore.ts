import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DeliveryType } from "@/components/DeliveryTypeSelector";
import type { DueDateOption } from "@/components/DueDateSelector";
import type { ServiceType, ServiceSubType } from "@/services/cases";
import type { MediaItem } from "@/components/ImagePickerGrid";

export interface IntakeFormData {
  primaryImage: string | null;
  additionalImages: MediaItem[];
  carModel: string;
  customerName: string;
  contactNumber: string;
  kmCount: string;
  dueDate: DueDateOption | "";
  deliveryType: DeliveryType | "";
  notes: string;
  serviceType: ServiceType | "";
  serviceSubType: ServiceSubType | "";
}

interface IntakeStore {
  formData: IntakeFormData;
  vehicleNumber: string;
  createdCaseNumber: string | null;
  selectedSharingImages: string[];
  hydrated: boolean;
  setFormData: (data: Partial<IntakeFormData>) => void;
  setVehicleNumber: (vn: string) => void;
  setCreatedCaseNumber: (caseNumber: string | null) => void;
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
  serviceType: "",
  serviceSubType: "",
};

export const useIntakeStore = create<IntakeStore>()(
  persist(
    (set) => ({
      formData: defaultFormData,
      vehicleNumber: "",
      createdCaseNumber: null,
      selectedSharingImages: [],
      hydrated: false,
      setFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setVehicleNumber: (vehicleNumber) => set({ vehicleNumber }),
      setCreatedCaseNumber: (createdCaseNumber) => set({ createdCaseNumber }),
      setSelectedSharingImages: (selectedSharingImages) =>
        set({ selectedSharingImages }),
      setHydrated: (hydrated) => set({ hydrated }),
      reset: () =>
        set({
          formData: defaultFormData,
          vehicleNumber: "",
          createdCaseNumber: null,
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
        createdCaseNumber: state.createdCaseNumber,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
