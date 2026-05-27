import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as IntentLauncher from "expo-intent-launcher";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionButton } from "@/components/ActionButton";
import { AppHeader } from "@/components/AppHeader";
import colors from "@/constants/colors";
import { useIntakeStore } from "@/store/useIntakeStore";

const { width } = Dimensions.get("window");
const COLS = 3;
const CELL_SIZE = (width - 32 - (COLS - 1) * 6) / COLS;

export default function ImageSharingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { formData, vehicleNumber } = useIntakeStore();
  const [sharing, setSharing] = useState(false);

  const allImages = [
    ...(formData.primaryImage ? [formData.primaryImage] : []),
    ...formData.additionalImages.filter((m) => m.type === "image").map((m) => m.uri),
  ];

  const [selected, setSelected] = useState<Set<string>>(() => new Set(allImages));

  const toggleImage = useCallback((uri: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelected(new Set(allImages));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const deselectAll = () => {
    setSelected(new Set());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleShare = async () => {
    const selectedArr = allImages.filter((uri) => selected.has(uri));

    if (selectedArr.length === 0) {
      Alert.alert("No images selected", "Select at least one image to share.");
      return;
    }

    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (Platform.OS === "android") {
        // Convert any file:// URIs to content:// so WhatsApp can read them
        const contentUris = await Promise.all(
          selectedArr.map(async (uri) => {
            if (uri.startsWith("file://")) {
              return await FileSystem.getContentUriAsync(uri);
            }
            return uri;
          })
        );

        await IntentLauncher.startActivityAsync("android.intent.action.SEND_MULTIPLE", {
          type: "image/*",
          extra: { "android.intent.extra.STREAM": contentUris },
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
      } else {
        // iOS: share one at a time via system share sheet (WhatsApp supports multi-image in share sheet)
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert("Sharing not available", "This device does not support sharing.");
          return;
        }
        for (const uri of selectedArr) {
          await Sharing.shareAsync(uri, { mimeType: "image/jpeg", UTI: "public.jpeg" });
        }
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "message" in err) {
        const msg = (err as { message: string }).message;
        if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user cancel")) {
          Alert.alert("Share failed", "Could not share images to WhatsApp. Make sure WhatsApp is installed.");
        }
      }
    } finally {
      setSharing(false);
    }
  };

  const allSelected = allImages.every((uri) => selected.has(uri));
  const noneSelected = selected.size === 0;

  const renderItem = ({ item, index }: { item: string; index: number }) => {
    const isSelected = selected.has(item);
    const isPrimary = index === 0 && !!formData.primaryImage;

    return (
      <Pressable
        onPress={() => toggleImage(item)}
        style={({ pressed }) => [
          styles.cell,
          pressed && styles.cellPressed,
        ]}
      >
        <Image source={{ uri: item }} style={styles.img} />
        {isPrimary && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>Primary</Text>
          </View>
        )}
        <View
          style={[
            styles.checkOverlay,
            isSelected && styles.checkOverlaySelected,
          ]}
        >
          {isSelected && (
            <View style={styles.checkCircle}>
              <Feather name="check" size={12} color="#fff" />
            </View>
          )}
        </View>
        {!isSelected && (
          <View style={styles.uncheckedCircle} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="Share Images"
        subtitle={`${selected.size} of ${allImages.length} selected`}
        showBack
        rightElement={
          <Pressable
            onPress={allSelected ? deselectAll : selectAll}
            style={styles.selectAllBtn}
          >
            <Text style={styles.selectAllText}>
              {allSelected ? "None" : "All"}
            </Text>
          </Pressable>
        }
      />

      {allImages.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="image" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No images added</Text>
          <Text style={styles.emptyText}>
            Add photos in the Intake screen to share them here.
          </Text>
          <Pressable
            onPress={() => router.push("/intake")}
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>Go to Intake</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={allImages}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={renderItem}
            numColumns={COLS}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: insets.bottom + 100 },
            ]}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Pressable
                  onPress={allSelected ? deselectAll : selectAll}
                  style={styles.toggleAllRow}
                >
                  <View
                    style={[
                      styles.toggleCheck,
                      allSelected && styles.toggleCheckActive,
                    ]}
                  >
                    {allSelected && (
                      <Feather name="check" size={12} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.toggleAllText}>
                    {allSelected ? "Deselect all" : "Select all"}
                  </Text>
                </Pressable>
                <Text style={styles.vehicleTag}>{vehicleNumber}</Text>
              </View>
            }
          />

          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <ActionButton
              label={
                noneSelected
                  ? "Select images to share"
                  : `Share ${selected.size} Image${selected.size !== 1 ? "s" : ""} to WhatsApp`
              }
              icon="share-2"
              variant="whatsapp"
              onPress={handleShare}
              loading={sharing}
              disabled={noneSelected}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  grid: {
    padding: 16,
    gap: 6,
  },
  row: {
    gap: 6,
    marginBottom: 6,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.surface,
  },
  cellPressed: {
    opacity: 0.85,
  },
  img: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  primaryBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
    textTransform: "uppercase",
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  checkOverlaySelected: {
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  checkCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  uncheckedCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  toggleAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleAllText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
  vehicleTag: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: colors.primary,
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: colors.primaryFaint,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: colors.primary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  selectAllBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectAllText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
});
