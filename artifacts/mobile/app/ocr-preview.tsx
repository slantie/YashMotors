import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import colors from "@/constants/colors";
import { createCase } from "@/services/cases";
import {
  presignImage,
  confirmImages,
  uploadImageToS3,
  type ConfirmImageItem,
} from "@/services/caseEvents";
import { useIntakeStore } from "@/store/useIntakeStore";

export default function OcrPreviewScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { vehicleNumber, setVehicleNumber, formData, reset } = useIntakeStore();

  const [scanning, setScanning] = useState(true);
  const [vn, setVn] = useState(vehicleNumber || "");
  const [ocrDetected, setOcrDetected] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    phase: "idle" | "creating" | "uploading";
    done: number;
    total: number;
  }>({ phase: "idle", done: 0, total: 0 });
  const scanAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    loopAnim.start();

    const primaryUri = formData.primaryImage;
    const MIN_SCAN_MS = 2200;
    const startMs = Date.now();
    let cancelled = false;

    async function runOcr() {
      let extracted = "";

      if (primaryUri) {
        try {
          const form = new FormData();
          form.append("image", { uri: primaryUri, type: "image/jpeg", name: "plate.jpg" } as any);
          const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/ocr`, {
            method: "POST",
            body: form,
          });
          if (res.ok) {
            const json = await res.json();
            console.log("[OCR] Raw output:", json.raw);
            extracted = json.plate || "";
            if (extracted) console.log("[OCR] Matched plate:", extracted);
            else console.log("[OCR] No plate found. Raw:", json.raw);
          } else {
            console.log("[OCR] Server error:", res.status);
          }
        } catch (e) {
          console.log("[OCR] Request failed:", e);
        }
      }

      const remaining = Math.max(0, MIN_SCAN_MS - (Date.now() - startMs));
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));

      if (cancelled) return;

      loopAnim.stop();
      setScanning(false);
      if (extracted) {
        setVn(extracted);
        setOcrDetected(true);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(fadeIn, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }).start();
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 8 }).start();
    }

    runOcr();

    return () => {
      cancelled = true;
      loopAnim.stop();
    };
  }, []);

  const createMutation = useMutation({
    mutationFn: async () => {
      setUploadStatus({ phase: "creating", done: 0, total: 0 });
      const trimmed = vn.trim().toUpperCase().replace(/\s/g, "");
      setVehicleNumber(trimmed);

      const created = await createCase({
        vehicleNumber: trimmed,
        carModel: formData.carModel,
        customerName: formData.customerName || undefined,
        customerPhone: formData.contactNumber || undefined,
        kmCount: formData.kmCount || undefined,
        dueDate: formData.dueDate || undefined,
        deliveryType: formData.deliveryType || undefined,
        notes: formData.notes || undefined,
      });

      // Snapshot URIs NOW — still in component context, temp files still live
      const all = [
        ...(formData.primaryImage ? [{ uri: formData.primaryImage, isPrimary: true }] : []),
        ...formData.additionalImages.map((uri) => ({ uri, isPrimary: false })),
      ];

      if (all.length > 0) {
        setUploadStatus({ phase: "uploading", done: 0, total: all.length });
        const confirmed: ConfirmImageItem[] = [];

        for (const { uri, isPrimary } of all) {
          console.log(`[upload] starting uri=${uri} isPrimary=${isPrimary}`);
          try {
            const filename = isPrimary
              ? "primary.jpg"
              : `${Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}.jpg`;
            const presigned = await presignImage(created.caseNumber, {
              filename,
              contentType: "image/jpeg",
              folder: "intake",
            });
            console.log(`[upload] presign ok key=${presigned.key}`);
            await uploadImageToS3(presigned.uploadUrl, uri, "image/jpeg");
            console.log(`[upload] s3 ok key=${presigned.key}`);
            confirmed.push({ key: presigned.key, filename, folder: "intake", isPrimary });
          } catch (e) {
            console.error(`[upload] FAILED uri=${uri}`, e);
          }
          setUploadStatus((prev) => ({ ...prev, done: prev.done + 1 }));
        }

        console.log(`[upload] confirmed=${confirmed.length}/${all.length}`);
        if (confirmed.length > 0) {
          try {
            await confirmImages(created.caseNumber, confirmed);
            console.log(`[upload] confirm ok`);
            queryClient.invalidateQueries({ queryKey: ["images", created.caseNumber, "intake"] });
          } catch (e) {
            console.error(`[upload] confirm FAILED`, e);
          }
        }
      }

      return created;
    },
    onSuccess: (created) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      setUploadStatus({ phase: "idle", done: 0, total: 0 });
      router.replace({
        pathname: "/(cases)/[caseNumber]",
        params: { caseNumber: created.caseNumber },
      });
    },
    onError: (err) => {
      setUploadStatus({ phase: "idle", done: 0, total: 0 });
      Alert.alert(
        "Could not create case",
        err instanceof Error ? err.message : "Please try again."
      );
    },
  });


const scanY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 144] });

  return (
    <View style={styles.root}>
      <AppHeader title="Scan Number Plate" subtitle="OCR Recognition" showBack />

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.cameraCard}>
          <View style={styles.cameraSim}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />

            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanY }] }]} />

            {formData.primaryImage ? (
              <Image
                source={{ uri: formData.primaryImage }}
                style={styles.capturedImage}
                resizeMode="cover"
              />
            ) : null}

            <Text style={styles.cameraHint}>
              {scanning ? "Scanning number plate..." : "Scan complete"}
            </Text>
          </View>
        </View>

        {!scanning && (
          <Animated.View style={[styles.resultCard, { opacity: fadeIn, transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.resultHeader}>
              <View style={styles.successBadge}>
                <Feather name="check" size={14} color="#fff" />
              </View>
              <Text style={styles.resultLabel}>Detected Vehicle Number</Text>
            </View>

            <TextInput
              style={styles.vnInput}
              value={vn}
              onChangeText={(t) => setVn(t.toUpperCase().replace(/\s/g, ""))}
              selectionColor={colors.primary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={11}
              placeholder="Vehicle number..."
              placeholderTextColor={colors.textMuted}
              editable={!createMutation.isPending}
            />

            <Text style={styles.editHint}>Tap to edit if OCR result is incorrect</Text>

            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Feather name="cpu" size={12} color={colors.primary} />
                <Text style={styles.metaText}>
                  {ocrDetected ? "Detected via OCR" : "Entered manually"}
                </Text>
              </View>
              {vn ? (
                <View style={styles.metaPill}>
                  <Feather name="map-pin" size={12} color={colors.primary} />
                  <Text style={styles.metaText}>{vn.slice(0, 2)}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        )}

        {scanning && (
          <View style={styles.scanningCard}>
            <Animated.View
              style={[styles.scanDot, {
                opacity: scanAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }),
              }]}
            />
            <Text style={styles.scanningText}>Analyzing image...</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={() => createMutation.mutate()}
            disabled={scanning || !vn.trim() || createMutation.isPending}
            style={[
              styles.createBtn,
              (scanning || !vn.trim() || createMutation.isPending) && styles.createBtnDisabled,
            ]}
          >
            {createMutation.isPending ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.createBtnText}>
                  {uploadStatus.phase === "uploading"
                    ? `Uploading photos ${uploadStatus.done}/${uploadStatus.total}...`
                    : "Creating job card..."}
                </Text>
              </>
            ) : (
              <>
                <Feather name="plus-circle" size={18} color="#fff" />
                <Text style={styles.createBtnText}>Create Job Card</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  cameraCard: { borderRadius: 16, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cameraSim: {
    height: 200, backgroundColor: "#0A0A12", position: "relative",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  cornerTL: { position: "absolute", top: 16, left: 16, width: 24, height: 24, borderTopWidth: 2, borderLeftWidth: 2, borderColor: colors.primary },
  cornerTR: { position: "absolute", top: 16, right: 16, width: 24, height: 24, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.primary },
  cornerBL: { position: "absolute", bottom: 40, left: 16, width: 24, height: 24, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: colors.primary },
  cornerBR: { position: "absolute", bottom: 40, right: 16, width: 24, height: 24, borderBottomWidth: 2, borderRightWidth: 2, borderColor: colors.primary },
  scanLine: {
    position: "absolute", top: 16, left: 16, right: 16, height: 2,
    backgroundColor: colors.primary, shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4,
  },
  capturedImage: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  cameraHint: { position: "absolute", bottom: 12, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary },
  resultCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  resultHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 },
  successBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  resultLabel: { fontSize: 14, fontFamily: "Inter_500Medium", fontWeight: "500" as const, color: colors.textSecondary },
  vnInput: {
    backgroundColor: colors.inputBg, borderRadius: colors.radius, borderWidth: 2,
    borderColor: colors.primary, color: colors.text, fontSize: 28,
    fontFamily: "Inter_700Bold", fontWeight: "700" as const,
    paddingHorizontal: 16, paddingVertical: 14, letterSpacing: 3,
    textAlign: "center", marginBottom: 8,
  },
  editHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", marginBottom: 14 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.primaryFaint, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary },
  scanningCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  scanDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  scanningText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary },
  footer: { marginTop: "auto" },
  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, height: 56, borderRadius: 14, backgroundColor: colors.primary,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" as const, color: "#fff",
  },
});
