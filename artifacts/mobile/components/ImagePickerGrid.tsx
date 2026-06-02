import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePickerLib from "expo-image-picker";
import React, { useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import colors from "@/constants/colors";

const { width } = Dimensions.get("window");
const CELL = (width - 32 - 8) / 3;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MediaItem {
  uri: string;
  type: "image" | "video";
}

// ── Permissions & launchers ────────────────────────────────────────────────────

async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePickerLib.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Camera Permission",
      "Allow Yash Motors App to access your camera in Settings.",
      [{ text: "OK" }],
    );
    return false;
  }
  return true;
}

async function requestGalleryPermission(): Promise<boolean> {
  const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Gallery Permission",
      "Allow Yash Motors App to access your photos in Settings.",
      [{ text: "OK" }],
    );
    return false;
  }
  return true;
}

async function takePhoto(): Promise<string | null> {
  if (!(await requestCameraPermission())) return null;
  const result = await ImagePickerLib.launchCameraAsync({
    mediaTypes: "images",
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

async function recordVideo(): Promise<MediaItem | null> {
  if (!(await requestCameraPermission())) return null;
  const result = await ImagePickerLib.launchCameraAsync({
    mediaTypes: ["videos"],
    quality: 1,
    videoMaxDuration: 120,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  return { uri: result.assets[0].uri, type: "video" };
}

async function pickFromGallery(
  multiple: boolean,
  includeVideos = false,
): Promise<MediaItem[]> {
  if (!(await requestGalleryPermission())) return [];
  const mediaTypes: ImagePickerLib.MediaType[] = includeVideos
    ? ["images", "videos"]
    : ["images"];
  const result = await ImagePickerLib.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: multiple,
    quality: 0.85,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    type: (a.type === "video" ? "video" : "image") as "image" | "video",
  }));
}

// ── Primary image picker ──────────────────────────────────────────────────────

interface PrimaryImagePickerProps {
  value: string | null;
  onChange: (uri: string | null) => void;
}

export function PrimaryImagePicker({
  value,
  onChange,
}: PrimaryImagePickerProps) {
  const handleHasImage = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Retake Photo", "Replace from Gallery", "Remove"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        async (idx) => {
          if (idx === 1) {
            const uri = await takePhoto();
            if (uri) onChange(uri);
          } else if (idx === 2) {
            const items = await pickFromGallery(false);
            if (items[0]) onChange(items[0].uri);
          } else if (idx === 3) {
            onChange(null);
          }
        },
      );
    } else {
      Alert.alert("Primary Photo", "What would you like to do?", [
        {
          text: "Retake Photo",
          onPress: async () => {
            const uri = await takePhoto();
            if (uri) onChange(uri);
          },
        },
        {
          text: "Replace from Gallery",
          onPress: async () => {
            const items = await pickFromGallery(false);
            if (items[0]) onChange(items[0].uri);
          },
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onChange(null),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  return (
    <View style={primaryStyles.wrapper}>
      <View style={primaryStyles.labelRow}>
        <Text style={primaryStyles.label}>Primary Photo</Text>
      </View>

      {value ? (
        <TouchableOpacity
          onPress={handleHasImage}
          activeOpacity={0.8}
          style={[primaryStyles.card, primaryStyles.hasImage]}
        >
          <Image source={{ uri: value }} style={primaryStyles.image} />
          <View style={primaryStyles.editBadge}>
            <Feather name="edit-2" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={primaryStyles.card}>
          <View style={primaryStyles.placeholder}>
            <View style={primaryStyles.iconRow}>
              <Pressable
                onPress={async () => {
                  const uri = await takePhoto();
                  if (uri) onChange(uri);
                }}
                style={({ pressed }) => [
                  primaryStyles.iconBtn,
                  pressed && primaryStyles.iconBtnPressed,
                ]}
              >
                <Feather name="camera" size={22} color={colors.primary} />
                <Text style={primaryStyles.iconLabel}>Camera</Text>
              </Pressable>
              <View style={primaryStyles.iconDivider} />
              <Pressable
                onPress={async () => {
                  const items = await pickFromGallery(false);
                  if (items[0]) onChange(items[0].uri);
                }}
                style={({ pressed }) => [
                  primaryStyles.iconBtn,
                  pressed && primaryStyles.iconBtnPressed,
                ]}
              >
                <Feather name="image" size={22} color={colors.primary} />
                <Text style={primaryStyles.iconLabel}>Gallery</Text>
              </Pressable>
            </View>
            <Text style={primaryStyles.placeholderText}>Add primary photo</Text>
            <Text style={primaryStyles.placeholderSub}>
              Vehicle front / overview
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Additional media picker ───────────────────────────────────────────────────

interface AdditionalImagesPickerProps {
  media: MediaItem[];
  onMediaChange: (media: MediaItem[]) => void;
}

export function AdditionalImagesPicker({
  media,
  onMediaChange,
}: AdditionalImagesPickerProps) {
  const [batchOpen, setBatchOpen] = useState(false);

  const handleGallery = async () => {
    const items = await pickFromGallery(true, true);
    onMediaChange([...media, ...items]);
  };

  const handleRecord = async () => {
    const item = await recordVideo();
    if (item) onMediaChange([...media, item]);
  };

  const handleRemove = (idx: number) => {
    Alert.alert("Remove media?", undefined, [
      {
        text: "Remove",
        style: "destructive",
        onPress: () => onMediaChange(media.filter((_, i) => i !== idx)),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={gridStyles.wrapper}>
      <View style={gridStyles.labelRow}>
        <Text style={gridStyles.label}>Additional Media</Text>
        <Text style={gridStyles.count}>{media.length}</Text>
      </View>

      {media.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={gridStyles.scroll}
        >
          {media.map((item, idx) => (
            <View key={`${item.uri}-${idx}`} style={gridStyles.cell}>
              {item.type === "video" ? (
                <View style={gridStyles.videoThumb}>
                  <Feather name="play-circle" size={28} color="rgba(255,255,255,0.9)" />
                </View>
              ) : (
                <Image source={{ uri: item.uri }} style={gridStyles.img} />
              )}
              <View style={gridStyles.typeBadge}>
                <Feather
                  name={item.type === "video" ? "video" : "image"}
                  size={9}
                  color="rgba(255,255,255,0.85)"
                />
              </View>
              <Pressable
                onPress={() => handleRemove(idx)}
                style={gridStyles.remove}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityRole="button"
                accessibilityLabel="Remove image"
              >
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={gridStyles.emptyHint}>
          <Feather name="film" size={15} color={colors.textMuted} />
          <Text style={gridStyles.emptyHintText}>No additional media yet</Text>
        </View>
      )}

      <View style={gridStyles.addRow}>
        <Pressable
          onPress={() => setBatchOpen(true)}
          style={({ pressed }) => [gridStyles.addBtn, pressed && gridStyles.addBtnPressed]}
        >
          <Feather name="camera" size={15} color={colors.primary} />
          <Text style={gridStyles.addBtnLabel}>Photos</Text>
        </Pressable>
        <Pressable
          onPress={handleRecord}
          style={({ pressed }) => [gridStyles.addBtn, pressed && gridStyles.addBtnPressed]}
        >
          <Feather name="video" size={15} color={colors.primary} />
          <Text style={gridStyles.addBtnLabel}>Record</Text>
        </Pressable>
        <Pressable
          onPress={handleGallery}
          style={({ pressed }) => [gridStyles.addBtn, pressed && gridStyles.addBtnPressed]}
        >
          <Feather name="image" size={15} color={colors.primary} />
          <Text style={gridStyles.addBtnLabel}>Gallery</Text>
        </Pressable>
      </View>

      <BatchCameraModal
        visible={batchOpen}
        onClose={() => setBatchOpen(false)}
        onConfirm={(items) => {
          onMediaChange([...media, ...items]);
          setBatchOpen(false);
        }}
      />
    </View>
  );
}

// ── Batch camera ──────────────────────────────────────────────────────────────

interface BatchCameraModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (items: MediaItem[]) => void;
}

function BatchCameraModal({ visible, onClose, onConfirm }: BatchCameraModalProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [pending, setPending] = useState<MediaItem[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [mediaMode, setMediaMode] = useState<"picture" | "video">("picture");
  const [isRecording, setIsRecording] = useState(false);

  const resetAndClose = () => {
    if (isRecording) cameraRef.current?.stopRecording();
    setPending([]);
    setCapturing(false);
    setIsRecording(false);
    setMediaMode("picture");
    onClose();
  };

  const ensurePermission = async (): Promise<boolean> => {
    if (permission?.granted) return true;
    const next = await requestPermission();
    if (!next.granted) {
      Alert.alert("Camera Permission", "Allow Yash Motors App to access your camera in Settings.", [{ text: "OK" }]);
      return false;
    }
    return true;
  };

  const handlePhotoCapture = async () => {
    if (capturing || !(await ensurePermission())) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (photo?.uri) setPending((prev) => [...prev, { uri: photo.uri, type: "image" }]);
    } finally {
      setCapturing(false);
    }
  };

  const handleVideoToggle = async () => {
    if (!(await ensurePermission())) return;
    if (isRecording) {
      cameraRef.current?.stopRecording();
    } else {
      setIsRecording(true);
      try {
        const result = await cameraRef.current?.recordAsync({ maxDuration: 120 });
        if (result?.uri) setPending((prev) => [...prev, { uri: result.uri, type: "video" }]);
      } catch {
        // recording cancelled or stopped externally
      } finally {
        setIsRecording(false);
      }
    }
  };

  const handleShutter = mediaMode === "picture" ? handlePhotoCapture : handleVideoToggle;

  const handleConfirm = () => {
    if (pending.length === 0) return;
    onConfirm(pending);
    setPending([]);
  };

  const photoCount = pending.filter((p) => p.type === "image").length;
  const videoCount = pending.filter((p) => p.type === "video").length;
  const counterText = [
    photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? "s" : ""}` : null,
    videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(", ") || "Ready";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={resetAndClose}
    >
      <View style={batchStyles.root}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={batchStyles.camera}
            facing="back"
            mode={mediaMode}
          />
        ) : (
          <View style={batchStyles.permissionPane}>
            <Feather name="camera" size={34} color={colors.textMuted} />
            <Text style={batchStyles.permissionTitle}>Camera access needed</Text>
            <TouchableOpacity onPress={requestPermission} style={batchStyles.permissionBtn} activeOpacity={0.8}>
              <Text style={batchStyles.permissionBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={batchStyles.topBar}>
          <Pressable onPress={resetAndClose} style={batchStyles.iconBtn} hitSlop={8}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <View style={batchStyles.counterRow}>
            {isRecording && <View style={batchStyles.recDot} />}
            <Text style={batchStyles.counter}>{isRecording ? "Recording..." : counterText}</Text>
          </View>
          <Pressable
            onPress={handleConfirm}
            disabled={pending.length === 0}
            style={[batchStyles.doneBtn, pending.length === 0 && batchStyles.doneBtnDisabled]}
          >
            <Text style={batchStyles.doneText}>Confirm</Text>
          </Pressable>
        </View>

        <View style={batchStyles.bottomPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={batchStyles.pendingStrip}>
            {pending.map((item, idx) => (
              <View key={`${item.uri}-${idx}`} style={batchStyles.pendingCell}>
                {item.type === "video" ? (
                  <View style={batchStyles.pendingVideoThumb}>
                    <Feather name="video" size={18} color="rgba(255,255,255,0.9)" />
                  </View>
                ) : (
                  <Image source={{ uri: item.uri }} style={batchStyles.pendingImage} />
                )}
                <Pressable
                  onPress={() => setPending((prev) => prev.filter((_, i) => i !== idx))}
                  style={batchStyles.pendingRemove}
                  hitSlop={4}
                >
                  <Feather name="x" size={11} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <View style={batchStyles.controls}>
            <View style={batchStyles.sideSlot}>
              <Pressable
                onPress={() => { if (!isRecording) setMediaMode((m) => m === "picture" ? "video" : "picture"); }}
                style={batchStyles.modeToggle}
                hitSlop={8}
              >
                <Feather name={mediaMode === "picture" ? "video" : "camera"} size={16} color="#fff" />
                <Text style={batchStyles.modeToggleText}>{mediaMode === "picture" ? "Video" : "Photo"}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleShutter}
              disabled={!permission?.granted || capturing}
              style={[
                batchStyles.shutter,
                mediaMode === "video" && batchStyles.shutterVideo,
                isRecording && batchStyles.shutterRecording,
                !permission?.granted && batchStyles.shutterDisabled,
              ]}
            >
              {capturing ? (
                <ActivityIndicator color={isRecording ? "#fff" : colors.primary} />
              ) : isRecording ? (
                <View style={batchStyles.stopInner} />
              ) : mediaMode === "video" ? (
                <View style={batchStyles.recordInner} />
              ) : (
                <View style={batchStyles.shutterInner} />
              )}
            </Pressable>

            <View style={batchStyles.sideSlot}>
              <Pressable onPress={() => setPending([])} disabled={pending.length === 0} hitSlop={8}>
                <Text style={[batchStyles.clearText, pending.length === 0 && batchStyles.clearTextDisabled]}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const primaryStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  labelRow: { flexDirection: "row", marginBottom: 8 },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: colors.radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    height: 160,
    overflow: "hidden",
    backgroundColor: colors.inputBg,
  },
  hasImage: {
    borderStyle: "solid",
    borderColor: colors.primary,
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  editBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 6,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  iconBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 4,
  },
  iconBtnPressed: {
    backgroundColor: colors.primaryFaint,
  },
  iconDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  iconLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
  },
  placeholderText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.text,
  },
  placeholderSub: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
});

const gridStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  count: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  scroll: {
    gap: 8,
    paddingVertical: 2,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  emptyHintText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  addBtnPressed: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primary,
  },
  addBtnLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 8,
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  videoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    padding: 3,
  },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});

const batchStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  camera: { ...StyleSheet.absoluteFillObject },
  permissionPane: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  permissionBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: "#fff",
  },
  doneBtn: {
    minWidth: 88,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  doneBtnDisabled: { opacity: 0.45 },
  doneText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: "#fff",
  },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingBottom: 26,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  pendingStrip: {
    minHeight: 70,
    gap: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  pendingCell: {
    width: 58,
    height: 58,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: colors.surface,
  },
  pendingImage: { width: "100%", height: "100%", resizeMode: "cover" },
  pendingRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    height: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 34,
  },
  sideSlot: { width: 72, alignItems: "center" },
  helperText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.82)",
  },
  clearText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  clearTextDisabled: { color: "rgba(255,255,255,0.35)" },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  pendingVideoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  modeToggle: {
    alignItems: "center",
    gap: 3,
  },
  modeToggleText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterVideo: {
    borderColor: "#FF3B30",
  },
  shutterRecording: {
    borderColor: "#FF3B30",
    backgroundColor: "rgba(255,59,48,0.2)",
  },
  shutterDisabled: { opacity: 0.45 },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
  },
  recordInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FF3B30",
  },
  stopInner: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
});
