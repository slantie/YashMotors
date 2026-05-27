import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";

// Stored as lowercase in DB; displayed via toTitleCase in UI
const TATA_MODELS = [
  "altroz",
  "aria",
  "bolt",
  "curvv",
  "harrier",
  "hexa",
  "indica",
  "indigo",
  "manza",
  "nano",
  "new safari",
  "nexon",
  "punch",
  "safari strome",
  "sierra",
  "sumo",
  "tiago",
  "tigor",
  "vista",
  "zest",
];

export function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface CarModelDropdownProps {
  value: string;
  onChange: (model: string) => void;
  error?: string;
}

export function CarModelDropdown({
  value,
  onChange,
  error,
}: CarModelDropdownProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const insets = useSafeAreaInsets();

  const q = search.trim().toLowerCase();
  const filtered = TATA_MODELS.filter((m) => m.includes(q));
  const showCustomOption = q.length > 0 && !TATA_MODELS.includes(q);

  const select = (model: string) => {
    onChange(model.toLowerCase());
    setSearch("");
    setVisible(false);
  };

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Car Model</Text>
        </View>
        <Pressable
          onPress={() => setVisible(true)}
          style={[styles.trigger, error ? styles.triggerError : null]}
        >
          <Text
            style={[styles.triggerText, !value && styles.placeholder]}
            numberOfLines={1}
          >
            {value ? toTitleCase(value) : "Select model..."}
          </Text>
          <Feather name="chevron-down" size={18} color={colors.textSecondary} />
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.overlay} onPress={() => setVisible(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Select Car Model</Text>
              <View style={styles.searchWrap}>
                <Feather
                  name="search"
                  size={16}
                  color={colors.textMuted}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search or type custom model..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  selectionColor={colors.primary}
                  autoFocus
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Feather name="x" size={15} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.item,
                      value === item && styles.itemSelected,
                    ]}
                    onPress={() => select(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        value === item && styles.itemTextSelected,
                      ]}
                    >
                      {toTitleCase(item)}
                    </Text>
                    {value === item && (
                      <Feather name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                ListFooterComponent={
                  showCustomOption ? (
                    <>
                      {filtered.length > 0 && <View style={styles.separator} />}
                      <TouchableOpacity
                        style={styles.customOption}
                        onPress={() => select(q)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.customIconWrap}>
                          <Feather name="plus" size={14} color={colors.primary} />
                        </View>
                        <View style={styles.customTextWrap}>
                          <Text style={styles.customLabel}>Use custom model</Text>
                          <Text style={styles.customValue}>{toTitleCase(q)}</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : null
                }
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 340 }}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  trigger: {
    backgroundColor: colors.inputBg,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerError: {
    borderColor: colors.destructive,
  },
  triggerText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
  error: {
    fontSize: 12,
    color: colors.destructive,
    fontFamily: "PlusJakartaSans_400Regular",
    marginTop: 4,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    paddingVertical: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  itemSelected: {
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 8,
  },
  itemText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.text,
  },
  itemTextSelected: {
    color: colors.primary,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  customOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  customIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  customTextWrap: {
    flex: 1,
  },
  customLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  customValue: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: colors.primary,
    marginTop: 1,
  },
});
