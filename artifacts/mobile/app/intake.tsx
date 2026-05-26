import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionButton } from "@/components/ActionButton";
import { AppHeader } from "@/components/AppHeader";
import { CarModelDropdown } from "@/components/CarModelDropdown";
import {
  DeliveryTypeSelector,
  DeliveryType,
} from "@/components/DeliveryTypeSelector";
import { DueDateSelector, DueDateOption } from "@/components/DueDateSelector";
import { FormInput } from "@/components/FormInput";
import {
  AdditionalImagesPicker,
  PrimaryImagePicker,
} from "@/components/ImagePickerGrid";
import colors from "@/constants/colors";
import { useIntakeStore } from "@/store/useIntakeStore";

interface FormValues {
  carModel: string;
  customerName: string;
  contactNumber: string;
  kmCount: string;
  dueDate: DueDateOption | "";
  deliveryType: DeliveryType | "";
  notes: string;
}

export default function IntakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { formData, setFormData, reset, createdCaseNumber } = useIntakeStore();

  const {
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      carModel: formData.carModel,
      customerName: formData.customerName,
      contactNumber: formData.contactNumber,
      kmCount: formData.kmCount,
      dueDate: formData.dueDate,
      deliveryType: formData.deliveryType,
      notes: formData.notes,
    },
  });

  // When user returns to intake screen after a case was successfully created,
  // clear the store so the form starts fresh for the next vehicle.
  useFocusEffect(
    useCallback(() => {
      if (createdCaseNumber) {
        reset();
        resetForm({
          carModel: "",
          customerName: "",
          contactNumber: "",
          kmCount: "",
          dueDate: "",
          deliveryType: "",
          notes: "",
        });
      }
    }, [createdCaseNumber]),
  );

  const onSubmit = useCallback(
    (values: FormValues) => {
      setFormData(values);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push("/ocr-preview");
    },
    [setFormData, router],
  );

  const handleReset = () => {
    Alert.alert("Reset Form", "This will clear all entered data and photos.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          reset();
          resetForm({
            carModel: "",
            customerName: "",
            contactNumber: "",
            kmCount: "",
            dueDate: "",
            deliveryType: "",
            notes: "",
          });
          setFormData({
            primaryImage: null,
            additionalImages: [],
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="New Job Card"
        subtitle="Vehicle Intake"
        rightElement={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/cases")}
              hitSlop={8}
            >
              <Feather name="folder" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/settings")}
              hitSlop={8}
            >
              <Feather name="settings" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step indicator */}
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <Text style={[styles.stepLabel, styles.stepLabelActive]}>
                Photos
              </Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot} />
              <Text style={styles.stepLabel}>Vehicle</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot} />
              <Text style={styles.stepLabel}>Customer</Text>
            </View>
          </View>

          {/* Vehicle Photos */}
          <View style={styles.section}>
            <SectionHeader label="Vehicle Photos" />
            <PrimaryImagePicker
              value={formData.primaryImage}
              onChange={(uri) => setFormData({ primaryImage: uri })}
            />
            <Text style={styles.hintText}>Required for plate scan</Text>
            <AdditionalImagesPicker
              images={formData.additionalImages}
              onImagesChange={(imgs) => setFormData({ additionalImages: imgs })}
            />
          </View>

          {/* Vehicle Details */}
          <View style={styles.section}>
            <SectionHeader label="Vehicle Details" />

            <Controller
              control={control}
              name="carModel"
              rules={{ required: "Car model is required" }}
              render={({ field: { value, onChange } }) => (
                <CarModelDropdown
                  value={value}
                  onChange={onChange}
                  error={errors.carModel?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="kmCount"
              rules={{ required: "KM count is required" }}
              render={({ field: { value, onChange, onBlur } }) => (
                <FormInput
                  label="KM Count"
                  placeholder="e.g. 45000"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numeric"
                  error={errors.kmCount?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="deliveryType"
              rules={{ required: "Please select a delivery type" }}
              render={({ field: { value, onChange } }) => (
                <DeliveryTypeSelector
                  value={value}
                  onChange={onChange}
                  error={errors.deliveryType?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="dueDate"
              render={({ field: { value, onChange } }) => (
                <DueDateSelector
                  value={value}
                  onChange={onChange}
                  error={errors.dueDate?.message}
                />
              )}
            />
          </View>

          {/* Customer Details */}
          <View style={styles.section}>
            <SectionHeader label="Customer Details" />

            <Controller
              control={control}
              name="customerName"
              rules={{ required: "Customer name is required" }}
              render={({ field: { value, onChange, onBlur } }) => (
                <FormInput
                  label="Customer Name"
                  placeholder="e.g. Rajesh Patel"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.customerName?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="contactNumber"
              rules={{
                required: "Contact number is required",
                pattern: {
                  value: /^[0-9+\-\s]{7,15}$/,
                  message: "Enter a valid phone number",
                },
              }}
              render={({ field: { value, onChange, onBlur } }) => (
                <FormInput
                  label="Contact Number"
                  placeholder="+91 98765 43210"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  error={errors.contactNumber?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="notes"
              render={({ field: { value, onChange, onBlur } }) => (
                <FormInput
                  label="Notes"
                  placeholder="e.g. Check brakes, oil change needed..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  optional
                  multiline
                  numberOfLines={3}
                  style={styles.notesInput}
                  error={errors.notes?.message}
                />
              )}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={handleReset}>
            <Text style={styles.resetText}>Reset Form</Text>
          </Pressable>
          <ActionButton
            label={
              formData.primaryImage
                ? "Scan Number Plate"
                : "Skip Photo & Continue"
            }
            icon="camera"
            iconRight="arrow-right"
            onPress={handleSubmit(onSubmit)}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.dot} />
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  stepItem: {
    alignItems: "center",
    gap: 4,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepLabelActive: {
    color: colors.primary,
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  dot: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    letterSpacing: 0.2,
  },
  hintText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    marginTop: -8,
    marginBottom: 16,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  resetText: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    paddingVertical: 4,
  },
});
