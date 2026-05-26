import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import colors from "@/constants/colors";
import type { CaseEventImage } from "@/services/caseEvents";

interface ImageThumbnailProps {
  image: CaseEventImage;
  onPress: () => void;
  onLongPress?: () => void;
  uploading?: boolean;
  selectMode?: boolean;
  selected?: boolean;
}

export function ImageThumbnail({
  image,
  onPress,
  onLongPress,
  uploading,
  selectMode,
  selected,
}: ImageThumbnailProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <Image source={{ uri: image.url }} style={styles.image} />
      {image.isPrimary && (
        <View style={styles.primaryBadge}>
          <Feather name="star" size={10} color="#fff" />
        </View>
      )}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
      {selectMode && (
        <View style={[styles.selectOverlay, selected && styles.selectOverlayActive]}>
          <View style={[styles.selectCircle, selected && styles.selectCircleActive]}>
            {selected && <Feather name="check" size={12} color="#fff" />}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  pressed: { opacity: 0.78 },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  primaryBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  selectOverlayActive: {
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  selectCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCircleActive: {
    backgroundColor: colors.primary,
    borderColor: "#fff",
  },
});
