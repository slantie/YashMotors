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
import { IntakeStepBar } from "@/components/IntakeStepBar";
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
  const { vehicleNumber, setVehicleNumber, formData, setCreatedCaseNumber } = useIntakeStore();

  const [scanning, setScanning] = useState(true);
  const [vn, setVn] = useState(vehicleNumber || "");
  const [ocrDetected, setOcrDetected] = useState(false);
  const [ocrSource, setOcrSource] = useState<"paddle" | "textract" | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    phase: "idle" | "creating" | "uploading";
    done: number;
    total: number;
    failedCount: number;
  }>({ phase: "idle", done: 0, total: 0, failedCount: 0 });
  const [dots, setDots] = useState(1);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cardScaleAnim = useRef(new Animated.Value(0.95)).current;
  const cornerAnim = useRef(new Animated.Value(0.55)).current;
  const resultAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loopAnim.start();

    const cornerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(cornerAnim, { toValue: 0.45, duration: 600, useNativeDriver: true }),
      ])
    );
    cornerLoop.start();

    const dotsTimer = setInterval(() => setDots((d) => (d % 3) + 1), 480);

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
            setOcrSource(json.source || null);
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
      cornerLoop.stop();
      clearInterval(dotsTimer);
      setScanning(false);
      if (extracted) {
        setVn(extracted);
        setOcrDetected(true);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resultAnims.forEach((a) => a.setValue(0));
      Animated.spring(cardScaleAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 5 }).start();
      Animated.stagger(75, resultAnims.map((a) =>
        Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 })
      )).start();
    }

    runOcr();

    return () => {
      cancelled = true;
      loopAnim.stop();
      cornerLoop.stop();
      clearInterval(dotsTimer);
    };
  }, []);

  const createMutation = useMutation({
    mutationFn: async () => {
      setUploadStatus({ phase: "creating", done: 0, total: 0, failedCount: 0 });
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
        serviceType: formData.serviceType || undefined,
        serviceSubType: formData.serviceSubType || undefined,
      });

      // Snapshot URIs NOW — still in component context, temp files still live
      const all = [
        ...(formData.primaryImage ? [{ uri: formData.primaryImage, mediaType: "image" as const, isPrimary: true }] : []),
        ...formData.additionalImages.map((m) => ({ uri: m.uri, mediaType: m.type, isPrimary: false })),
      ];

      if (all.length > 0) {
        setUploadStatus({ phase: "uploading", done: 0, total: all.length, failedCount: 0 });

        const uploadOne = async ({ uri, mediaType, isPrimary }: { uri: string; mediaType: "image" | "video"; isPrimary: boolean }): Promise<ConfirmImageItem | null> => {
          const isVideo = mediaType === "video";
          const ext = isVideo ? (uri.split(".").pop()?.toLowerCase() === "mov" ? "mov" : "mp4") : "jpg";
          const contentType = isVideo ? (ext === "mov" ? "video/quicktime" : "video/mp4") : "image/jpeg";
          const filename = isPrimary
            ? `primary.${ext}`
            : `${Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}.${ext}`;
          try {
            const presigned = await presignImage(created.caseNumber, { filename, contentType, folder: "intake" });
            await uploadImageToS3(presigned.uploadUrl, uri, contentType);
            return { key: presigned.key, filename, folder: "intake", isPrimary, mediaType };
          } catch (e) {
            console.error(`[upload] FAILED uri=${uri}`, e);
            return null;
          } finally {
            setUploadStatus((prev) => ({ ...prev, done: prev.done + 1 }));
          }
        };

        const results = await Promise.allSettled(all.map(uploadOne));
        const confirmed: ConfirmImageItem[] = results
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter((v): v is ConfirmImageItem => v !== null);

        const failCount = all.length - confirmed.length;
        if (failCount > 0) {
          console.warn(`[upload] ${failCount}/${all.length} images failed`);
          setUploadStatus((prev) => ({ ...prev, failedCount: failCount }));
        }

        if (confirmed.length > 0) {
          try {
            await confirmImages(created.caseNumber, confirmed);
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
      const failedCount = uploadStatus.failedCount;
      setUploadStatus({ phase: "idle", done: 0, total: 0, failedCount: 0 });
      // Store caseNumber so WhatsApp workflow can reference this case; intake
      // screen resets the store when user starts a new intake (via useFocusEffect).
      setCreatedCaseNumber(created.caseNumber);

      const navigate = () => router.replace({
        pathname: "/(cases)/[caseNumber]",
        params: { caseNumber: created.caseNumber },
      });

      if (failedCount > 0) {
        Alert.alert(
          "Case created",
          `${failedCount} photo${failedCount > 1 ? "s" : ""} failed to upload. You can upload them from the case detail screen.`,
          [{ text: "OK", onPress: navigate }]
        );
      } else {
        navigate();
      }
    },
    onError: (err) => {
      setUploadStatus({ phase: "idle", done: 0, total: 0, failedCount: 0 });
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
        <IntakeStepBar currentStep={1} />

        <View style={styles.cameraCard}>
          <View style={styles.cameraSim}>
            <Animated.View style={[styles.cornerTL, { opacity: cornerAnim }]} />
            <Animated.View style={[styles.cornerTR, { opacity: cornerAnim }]} />
            <Animated.View style={[styles.cornerBL, { opacity: cornerAnim }]} />
            <Animated.View style={[styles.cornerBR, { opacity: cornerAnim }]} />

            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanY }] }]} />

            {formData.primaryImage ? (
              <Image
                source={{ uri: formData.primaryImage }}
                style={styles.capturedImage}
                resizeMode="cover"
              />
            ) : null}

            <Text style={styles.cameraHint}>
              {scanning ? `Analyzing${".".repeat(dots)}` : "Scan complete ✓"}
            </Text>
          </View>
        </View>

        {!scanning && (
          <Animated.View style={[styles.resultCard, { transform: [{ scale: cardScaleAnim }] }]}>
            <Animated.View style={[styles.resultHeader, {
              opacity: resultAnims[0],
              transform: [{ translateY: resultAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }]}>
              <View style={styles.successBadge}>
                <Feather name="check" size={14} color="#fff" />
              </View>
              <Text style={styles.resultLabel}>Detected Vehicle Number</Text>
            </Animated.View>

            <Animated.View style={{
              opacity: resultAnims[1],
              transform: [{ translateY: resultAnims[1].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }}>
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
            </Animated.View>

            <Animated.View style={{
              opacity: resultAnims[2],
              transform: [{ translateY: resultAnims[2].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}>
              <Text style={styles.editHint}>Tap to edit if OCR result is incorrect</Text>
            </Animated.View>

            <Animated.View style={[styles.metaRow, {
              opacity: resultAnims[3],
              transform: [{ translateY: resultAnims[3].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }]}>
              <View style={styles.metaPill}>
                <Feather name="cpu" size={12} color={colors.primary} />
                <Text style={styles.metaText}>
                  {ocrDetected
                    ? ocrSource === "textract" ? "AWS Textract" : "PaddleOCR"
                    : "Entered manually"}
                </Text>
              </View>
              {vn ? (
                <View style={styles.metaPill}>
                  <Feather name="map-pin" size={12} color={colors.primary} />
                  <Text style={styles.metaText}>{vn.slice(0, 2)}</Text>
                </View>
              ) : null}
            </Animated.View>
          </Animated.View>
        )}

        {scanning && (
          <View style={styles.scanningCard}>
            <Animated.View style={[styles.scanDot, { opacity: cornerAnim }]} />
            <Text style={styles.scanningText}>
              {`Analyzing${".".repeat(dots)}`}
            </Text>
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
  cameraHint: { position: "absolute", bottom: 12, fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary },
  resultCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  resultHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 },
  successBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  resultLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium", fontWeight: "500" as const, color: colors.textSecondary },
  vnInput: {
    backgroundColor: colors.inputBg, borderRadius: colors.radius, borderWidth: 2,
    borderColor: colors.primary, color: colors.text, fontSize: 28,
    fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const,
    paddingHorizontal: 16, paddingVertical: 14, letterSpacing: 3,
    textAlign: "center", marginBottom: 8,
  },
  editHint: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted, textAlign: "center", marginBottom: 14 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.primaryFaint, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  metaText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: colors.primary },
  scanningCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  scanDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  scanningText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary },
  footer: { marginTop: "auto" },
  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, height: 56, borderRadius: 14, backgroundColor: colors.primary,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: {
    fontSize: 16, fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const, color: "#fff",
  },
});
