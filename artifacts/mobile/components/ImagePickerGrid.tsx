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

async function pickFromGallery(
  multiple: boolean,
  mediaTypes: ImagePickerLib.MediaType | ImagePickerLib.MediaType[] = "images",
): Promise<string[]> {
  if (!(await requestGalleryPermission())) return [];
  const result = await ImagePickerLib.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: multiple,
    quality: 0.85,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => a.uri);
}

// ── Source picker (camera vs gallery) ─────────────────────────────────────────

function showSourcePicker(onCamera: () => void, onGallery: () => void) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Gallery"],
        cancelButtonIndex: 0,
      },
      (idx) => {
        if (idx === 1) onCamera();
        if (idx === 2) onGallery();
      },
    );
  } else {
    Alert.alert("Add Photo", "Choose source", [
      { text: "Take Photo", onPress: onCamera },
      { text: "Choose from Gallery", onPress: onGallery },
      { text: "Cancel", style: "cancel" },
    ]);
  }
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
  const handleEmpty = () => {
    showSourcePicker(
      async () => {
        const uri = await takePhoto();
        if (uri) onChange(uri);
      },
      async () => {
        const uris = await pickFromGallery(false);
        if (uris[0]) onChange(uris[0]);
      },
    );
  };

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
            const uris = await pickFromGallery(false);
            if (uris[0]) onChange(uris[0]);
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
            const uris = await pickFromGallery(false);
            if (uris[0]) onChange(uris[0]);
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
        <Text style={primaryStyles.label}>Primary Image</Text>
      </View>
      <TouchableOpacity
        onPress={value ? handleHasImage : handleEmpty}
        activeOpacity={0.8}
        style={[primaryStyles.card, value && primaryStyles.hasImage]}
      >
        {value ? (
          <>
            <Image source={{ uri: value }} style={primaryStyles.image} />
            <View style={primaryStyles.editBadge}>
              <Feather name="edit-2" size={12} color="#fff" />
            </View>
          </>
        ) : (
          <View style={primaryStyles.placeholder}>
            <View style={primaryStyles.iconRow}>
              <View style={primaryStyles.iconBtn}>
                <Feather name="camera" size={22} color={colors.primary} />
                <Text style={primaryStyles.iconLabel}>Camera</Text>
              </View>
              <View style={primaryStyles.iconDivider} />
              <View style={primaryStyles.iconBtn}>
                <Feather name="image" size={22} color={colors.primary} />
                <Text style={primaryStyles.iconLabel}>Gallery</Text>
              </View>
            </View>
            <Text style={primaryStyles.placeholderText}>
              Tap to add primary photo
            </Text>
            <Text style={primaryStyles.placeholderSub}>
              Vehicle front / overview
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Additional images picker ──────────────────────────────────────────────────

interface AdditionalImagesPickerProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  mediaTypes?: ImagePickerLib.MediaType | ImagePickerLib.MediaType[];
}

export function AdditionalImagesPicker({
  images,
  onImagesChange,
  maxImages = 10,
  mediaTypes = "images",
}: AdditionalImagesPickerProps) {
  const [batchOpen, setBatchOpen] = useState(false);
  const slotsLeft = Math.max(maxImages - images.length, 0);

  const handleAdd = () => {
    showSourcePicker(
      () => setBatchOpen(true),
      async () => {
        const uris = await pickFromGallery(true, mediaTypes);
        const next = [...images, ...uris].slice(0, maxImages);
        onImagesChange(next);
      },
    );
  };

  const handleRemove = (idx: number) => {
    Alert.alert("Remove image?", undefined, [
      {
        text: "Remove",
        style: "destructive",
        onPress: () => onImagesChange(images.filter((_, i) => i !== idx)),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={gridStyles.wrapper}>
      <View style={gridStyles.labelRow}>
        <Text style={gridStyles.label}>Additional Images</Text>
        <Text style={gridStyles.count}>
          {images.length}/{maxImages}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={gridStyles.scroll}
      >
        {images.length < maxImages && (
          <TouchableOpacity
            onPress={handleAdd}
            style={gridStyles.addCell}
            activeOpacity={0.7}
          >
            <Feather name="camera" size={18} color={colors.primary} />
            <Feather
              name="plus"
              size={12}
              color={colors.primary}
              style={gridStyles.plusOverlay}
            />
          </TouchableOpacity>
        )}
        {images.map((uri, idx) => (
          <View key={`${uri}-${idx}`} style={gridStyles.cell}>
            <Image source={{ uri }} style={gridStyles.img} />
            <Pressable
              onPress={() => handleRemove(idx)}
              style={gridStyles.remove}
              hitSlop={4}
            >
              <Feather name="x" size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <BatchCameraModal
        visible={batchOpen}
        maxImages={slotsLeft}
        onClose={() => setBatchOpen(false)}
        onConfirm={(uris) => {
          onImagesChange([...images, ...uris].slice(0, maxImages));
          setBatchOpen(false);
        }}
      />
    </View>
  );
}

// ── Batch camera ──────────────────────────────────────────────────────────────

interface BatchCameraModalProps {
  visible: boolean;
  maxImages: number;
  onClose: () => void;
  onConfirm: (uris: string[]) => void;
}

function BatchCameraModal({
  visible,
  maxImages,
  onClose,
  onConfirm,
}: BatchCameraModalProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [pending, setPending] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);

  const resetAndClose = () => {
    setPending([]);
    setCapturing(false);
    onClose();
  };

  const handleCapture = async () => {
    if (capturing || pending.length >= maxImages) return;

    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        Alert.alert(
          "Camera Permission",
          "Allow Yash Motors App to access your camera in Settings.",
          [{ text: "OK" }],
        );
        return;
      }
    }

    try {
      setCapturing(true);
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setPending((prev) => [...prev, photo.uri].slice(0, maxImages));
      }
    } finally {
      setCapturing(false);
    }
  };

  const handleRemove = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = () => {
    if (pending.length === 0) return;
    onConfirm(pending);
    setPending([]);
  };

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
            mode="picture"
          />
        ) : (
          <View style={batchStyles.permissionPane}>
            <Feather name="camera" size={34} color={colors.textMuted} />
            <Text style={batchStyles.permissionTitle}>
              Camera access needed
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              style={batchStyles.permissionBtn}
              activeOpacity={0.8}
            >
              <Text style={batchStyles.permissionBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={batchStyles.topBar}>
          <Pressable
            onPress={resetAndClose}
            style={batchStyles.iconBtn}
            hitSlop={8}
          >
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <Text style={batchStyles.counter}>
            {pending.length}/{maxImages}
          </Text>
          <Pressable
            onPress={handleConfirm}
            disabled={pending.length === 0}
            style={[
              batchStyles.doneBtn,
              pending.length === 0 && batchStyles.doneBtnDisabled,
            ]}
          >
            <Text style={batchStyles.doneText}>Confirm</Text>
          </Pressable>
        </View>

        <View style={batchStyles.bottomPanel}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={batchStyles.pendingStrip}
          >
            {pending.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={batchStyles.pendingCell}>
                <Image source={{ uri }} style={batchStyles.pendingImage} />
                <Pressable
                  onPress={() => handleRemove(idx)}
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
              <Text style={batchStyles.helperText}>
                {maxImages - pending.length} left
              </Text>
            </View>
            <Pressable
              onPress={handleCapture}
              disabled={
                !permission?.granted || capturing || pending.length >= maxImages
              }
              style={[
                batchStyles.shutter,
                (!permission?.granted || pending.length >= maxImages) &&
                  batchStyles.shutterDisabled,
              ]}
            >
              {capturing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={batchStyles.shutterInner} />
              )}
            </Pressable>
            <View style={batchStyles.sideSlot}>
              <Pressable
                onPress={() => setPending([])}
                disabled={pending.length === 0}
                hitSlop={8}
              >
                <Text
                  style={[
                    batchStyles.clearText,
                    pending.length === 0 && batchStyles.clearTextDisabled,
                  ]}
                >
                  Clear
                </Text>
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
    gap: 0,
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
  addCell: {
    width: CELL,
    height: CELL,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.inputBg,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  plusOverlay: {
    position: "absolute",
    bottom: "28%",
    right: "28%",
  },
});

const batchStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
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
  doneBtnDisabled: {
    opacity: 0.45,
  },
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
  pendingImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
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
  sideSlot: {
    width: 72,
    alignItems: "center",
  },
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
  clearTextDisabled: {
    color: "rgba(255,255,255,0.35)",
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
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
  },
});
