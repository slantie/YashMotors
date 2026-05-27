import { Feather } from "@expo/vector-icons";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import * as ImagePickerLib from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ImageViewing from "react-native-image-viewing";
import { VideoView, useVideoPlayer } from "expo-video";

let RNShare: { open: (opts: Record<string, unknown>) => Promise<void> } | null =
  null;
try {
  RNShare = require("react-native-share").default;
} catch {
  // Expo Go — sharing unavailable
}

import { AppHeader } from "@/components/AppHeader";
import { Toast } from "@/components/Toast";
import { StatusBadge, statusLabel } from "@/components/cases/StatusBadge";
import { AddEventForm } from "@/components/cases/AddEventForm";
import { ImageThumbnail } from "@/components/cases/ImageThumbnail";
import colors from "@/constants/colors";
import {
  CustomerStatus,
  InternalStatus,
  deleteCase,
  fetchCase,
  notifyAdvisor,
  transferCase,
  updateCustomerStatus,
  updateInternalStatus,
  type CaseDetail,
} from "@/services/cases";
import { fetchAdvisors, type UserListItem } from "@/services/users";
import {
  confirmImages,
  deleteImage,
  editCase,
  presignImage,
  uploadImageToS3,
  type CaseEventImage,
  type ConfirmImageItem,
} from "@/services/caseEvents";
import { useAuthStore } from "@/store/useAuthStore";
import { useIntakeStore } from "@/store/useIntakeStore";
import { useCaseImages } from "@/hooks/useCaseImages";
import { useToast } from "@/hooks/useToast";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import {
  createWhatsAppGroup,
  sendWhatsAppMessage,
  type CreateGroupResult,
} from "@/services/whatsapp";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { formatCaseMessage } from "@/utils/messageFormatter";
import { toTitleCase } from "@/components/CarModelDropdown";

const INTERNAL_STATUSES: InternalStatus[] = [
  "intake",
  "in_progress",
  "awaiting_parts",
  "denting",
  "painting",
  "polishing",
  "electrical",
  "washing",
  "quality_check",
  "ready",
  "delivered",
  "cancelled",
];

const TECHNICIAN_STATUSES: InternalStatus[] = [
  "in_progress",
  "awaiting_parts",
  "denting",
  "painting",
  "polishing",
  "electrical",
  "washing",
  "quality_check",
  "ready",
];

const TECH_TIMELINE_EVENTS = [
  "intake_created",
  "internal_status_change",
  "image_uploaded",
  "case_transferred",
];

const CUSTOMER_STATUSES: CustomerStatus[] = [
  "received",
  "in_repair",
  "final_inspection",
  "ready_for_delivery",
  "delivered",
];

const ARRIVAL_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  pickup: "Pickup",
  customer_waiting: "Customer Waiting",
  breakdown: "Breakdown",
};

const SERVICE_SUB_LABELS: Record<string, string> = {
  major: "Major",
  minor: "Minor",
  breakdown: "Breakdown",
  running: "Running",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function VideoViewerContent({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      allowsFullscreen
      nativeControls
    />
  );
}

export default function CaseDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ caseNumber: string }>();
  const caseNumber = Array.isArray(params.caseNumber)
    ? params.caseNumber[0]
    : params.caseNumber;
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "superadmin" || role === "admin";
  const isPrivileged = isAdmin || role === "advisor";
  const isTechnician = role === "technician";
  const canUpdate = isPrivileged;
  const canUpdateInternal = isPrivileged || isTechnician;
  const queryClient = useQueryClient();
  const uploadProgress = useIntakeStore((state) => state.uploadProgress);

  const [internalOpen, setInternalOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedInternal, setSelectedInternal] =
    useState<InternalStatus>("intake");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerStatus>("received");
  const [note, setNote] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [imageFolder, setImageFolder] = useState<"intake" | "repairs">(
    role === "technician" ? "repairs" : "intake",
  );
  const [imageViewerState, setImageViewerState] = useState<{
    images: CaseEventImage[];
    startIndex: number;
  } | null>(null);
  const [videoViewerItem, setVideoViewerItem] = useState<CaseEventImage | null>(
    null,
  );
  const [downloadingImage, setDownloadingImage] = useState(false);
  const canEditCase = isPrivileged;
  const canUseWhatsApp = isPrivileged;
  const [waInitiated, setWaInitiated] = useState(false);
  const [waInitialMsg, setWaInitialMsg] = useState("");
  const [waCreateOpen, setWaCreateOpen] = useState(false);
  const [waSendOpen, setWaSendOpen] = useState(false);
  const [waSendMsg, setWaSendMsg] = useState("");
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();

  const waStatusQuery = useWhatsAppStatus(caseNumber, canUseWhatsApp);

  const caseQuery = useQuery({
    queryKey: ["case", caseNumber],
    queryFn: () => fetchCase(caseNumber),
    enabled: !!caseNumber,
  });

  const advisorsQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchAdvisors,
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const events = useMemo(
    () =>
      [...(caseQuery.data?.events ?? [])].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [caseQuery.data?.events],
  );

  const internalMutation = useMutation({
    mutationFn: () =>
      updateInternalStatus(
        caseNumber,
        selectedInternal,
        note.trim() || undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInternalOpen(false);
      setNote("");
    },
  });

  const customerMutation = useMutation({
    mutationFn: () => updateCustomerStatus(caseNumber, selectedCustomer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCustomerOpen(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: (patch: Record<string, string>) => editCase(caseNumber, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditOpen(false);
    },
  });

  const handleEditSave = () => {
    if (!editForm.vehicleNumber?.trim() || !editForm.carModel?.trim()) return;
    const ENUM_FIELDS = [
      "customerArrivalStatus",
      "serviceType",
      "serviceSubType",
    ] as const;
    const patch: Record<string, string | null> = { ...editForm };
    for (const f of ENUM_FIELDS) {
      if (patch[f] === "") patch[f] = null;
    }
    editMutation.mutate(patch as Record<string, string>);
  };

  const handleShareCaseInternally = async () => {
    if (!data) return;
    const lines: string[] = [
      `*Case: ${data.caseNumber}*`,
      `Vehicle: ${data.vehicleNumber}`,
      `Model: ${toTitleCase(data.carModel)}`,
    ];
    if (data.customerName) lines.push(`Customer: ${data.customerName}`);
    if (data.customerPhone) lines.push(`Phone: ${data.customerPhone}`);
    if (data.kmCount) lines.push(`KM: ${data.kmCount}`);
    if (data.dueDate) lines.push(`Due: ${data.dueDate}`);
    if (data.customerArrivalStatus)
      lines.push(
        `Arrival: ${ARRIVAL_LABELS[data.customerArrivalStatus] ?? data.customerArrivalStatus}`,
      );
    if (data.serviceType) {
      const sub = data.serviceSubType
        ? ` — ${SERVICE_SUB_LABELS[data.serviceSubType] ?? data.serviceSubType}`
        : "";
      lines.push(
        `Service: ${data.serviceType === "service" ? `Service${sub}` : "Repair"}`,
      );
    }
    lines.push(`Internal: ${statusLabel(data.internalStatus)}`);
    lines.push(`Customer: ${statusLabel(data.customerStatus)}`);
    lines.push(`Advisor: ${data.advisor.name}`);
    if (data.notes) lines.push(`Notes: ${data.notes}`);
    await Share.share({ message: lines.join("\n") });
  };

  const createGroupMutation = useMutation({
    mutationFn: ({ phone, msg }: { phone: string; msg?: string }) =>
      createWhatsAppGroup(caseNumber, phone, msg),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWaInitiated(true);
      setWaCreateOpen(false);
      waStatusQuery.refetch();
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to create group.",
      );
    },
  });

  const sendMsgMutation = useMutation({
    mutationFn: (message: string) => sendWhatsAppMessage(caseNumber, message),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWaSendOpen(false);
      setWaSendMsg("");
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      Alert.alert(
        "Message queued",
        "Your update will be sent to the group. Check the timeline to confirm delivery.",
      );
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to send message.",
      );
    },
  });

  const [submitDone, setSubmitDone] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAdvisorId, setTransferAdvisorId] = useState<number | null>(
    null,
  );
  const [transferNote, setTransferNote] = useState("");

  const notifyMutation = useMutation({
    mutationFn: () => notifyAdvisor(caseNumber),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitDone(true);
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to notify advisor.",
      );
    },
  });

  const handleSubmitToAdvisor = () => {
    Alert.alert(
      "Submit to Advisor",
      "Notify the advisor that repair work is ready for review?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => notifyMutation.mutate(),
        },
      ],
    );
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteCase(caseNumber),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      router.replace("/(cases)");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("not found")) {
        queryClient.invalidateQueries({ queryKey: ["cases"] });
        router.replace("/(cases)");
        return;
      }
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to delete case.",
      );
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      transferCase(
        caseNumber,
        transferAdvisorId!,
        transferNote.trim() || undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTransferOpen(false);
      setTransferAdvisorId(null);
      setTransferNote("");
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Transfer failed.",
      );
    },
  });

  const handleDeleteCase = () => {
    if (deleteMutation.isPending) return;
    Alert.alert(
      "Delete Case",
      `Permanently delete case ${caseNumber}? All events, images, and data will be lost.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (!deleteMutation.isPending) deleteMutation.mutate();
          },
        },
      ],
    );
  };

  const isExpoGo = Constants.appOwnership === "expo";

  const handleDownloadImage = async (image: CaseEventImage) => {
    if (isExpoGo) {
      Alert.alert(
        "Dev Build Required",
        "Saving to the photo library is not supported in Expo Go due to Android 13+ permission restrictions. Build a development build with EAS to enable this feature.",
        [{ text: "OK" }],
      );
      return;
    }
    setDownloadingImage(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Allow photo library access in Settings to save images.",
        );
        return;
      }
      const ext = image.url.split("?")[0].split(".").pop() ?? "jpg";
      const localUri = `${FileSystem.cacheDirectory}ym_${image.id}_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(image.url, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", `"${image.filename}" saved to photo library.`);
    } catch (e) {
      Alert.alert(
        "Download failed",
        e instanceof Error ? e.message : "Could not save image.",
      );
    } finally {
      setDownloadingImage(false);
    }
  };

  const data = caseQuery.data;

  return (
    <View style={styles.root}>
      <AppHeader
        title={caseNumber ?? "Case"}
        subtitle={data?.vehicleNumber}
        showBack
      />
      <Toast message={toastMsg} visible={toastVisible} />
      {uploadProgress?.caseNumber === caseNumber && uploadProgress && (
        <View
          style={[
            styles.uploadBanner,
            uploadProgress.phase === "failed" && styles.uploadBannerFailed,
            uploadProgress.phase === "done" && styles.uploadBannerDone,
          ]}
        >
          <ActivityIndicator
            color={
              uploadProgress.phase === "failed"
                ? colors.destructive
                : uploadProgress.phase === "done"
                  ? colors.success
                  : colors.primary
            }
            size="small"
          />
          <Text
            style={[
              styles.uploadBannerText,
              uploadProgress.phase === "failed" && styles.uploadBannerTextFail,
            ]}
          >
            {uploadProgress.phase === "uploading"
              ? `Uploading photos… ${uploadProgress.done}/${uploadProgress.total}`
              : uploadProgress.phase === "failed"
                ? `Upload done — ${uploadProgress.failedCount} failed`
                : "Photos uploaded"}
          </Text>
        </View>
      )}
      {caseQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : caseQuery.isError || !data ? (
        <View style={styles.center}>
          {(() => {
            const msg =
              caseQuery.error instanceof Error
                ? caseQuery.error.message.toLowerCase()
                : "";
            const isNotFound = msg.includes("not found") || msg.includes("404");
            return (
              <>
                <Feather
                  name={isNotFound ? "folder-minus" : "alert-circle"}
                  size={36}
                  color={colors.textMuted}
                  style={{ marginBottom: 12 }}
                />
                <Text style={styles.emptyTitle}>
                  {isNotFound ? "Case Not Found" : "Could not load case"}
                </Text>
                <Text style={styles.emptyText}>
                  {isNotFound
                    ? "This case may have been deleted."
                    : caseQuery.error instanceof Error
                      ? caseQuery.error.message
                      : "Please try again."}
                </Text>
                {isNotFound ? (
                  <Pressable
                    onPress={() => router.replace("/(cases)")}
                    style={styles.retryBtn}
                  >
                    <Feather
                      name="arrow-left"
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={styles.retryText}>Back to Cases</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => caseQuery.refetch()}
                    style={styles.retryBtn}
                  >
                    <Feather
                      name="refresh-cw"
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                )}
              </>
            );
          })()}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.caseNumber}>{data.caseNumber}</Text>
            <Text style={styles.vehicle}>{data.vehicleNumber}</Text>
            <Text style={styles.model}>{toTitleCase(data.carModel)}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={data.internalStatus} type="internal" />
              {!isTechnician && (
                <StatusBadge status={data.customerStatus} type="customer" />
              )}
            </View>
          </View>

          {isTechnician ? (
            <>
              {/* 1 — Update stage */}
              <StatusSection
                title="Internal Status"
                status={
                  <StatusBadge status={data.internalStatus} type="internal" />
                }
                canUpdate={canUpdateInternal}
                onUpdate={() => {
                  setSelectedInternal(data.internalStatus);
                  setInternalOpen(true);
                }}
              />

              {/* 2 — Photos */}
              <View style={styles.card}>
                <View style={styles.tabRow}>
                  <Pressable
                    onPress={() => setImageFolder("intake")}
                    style={[
                      styles.tab,
                      imageFolder === "intake" && styles.tabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        imageFolder === "intake" && styles.tabTextActive,
                      ]}
                    >
                      Intake Photos
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setImageFolder("repairs")}
                    style={[
                      styles.tab,
                      imageFolder === "repairs" && styles.tabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        imageFolder === "repairs" && styles.tabTextActive,
                      ]}
                    >
                      Repair Photos
                    </Text>
                  </Pressable>
                </View>
                <ImagesGrid
                  caseNumber={caseNumber}
                  folder={imageFolder}
                  role={role}
                  canUpload={!isTechnician || imageFolder === "repairs"}
                  onImageView={(imgs, idx) => {
                    const item = imgs[idx];
                    if (item.mediaType === "video") {
                      setVideoViewerItem(item);
                    } else {
                      const onlyImages = imgs.filter(
                        (m) => m.mediaType !== "video",
                      );
                      const startIndex = onlyImages.findIndex(
                        (m) => m.id === item.id,
                      );
                      setImageViewerState({
                        images: onlyImages,
                        startIndex: Math.max(0, startIndex),
                      });
                    }
                  }}
                />
              </View>

              {/* 3 — Case info */}
              <View style={styles.card}>
                <Info label="KM Count" value={data.kmCount} />
                <Info label="Due Date" value={data.dueDate} />
                <Info label="Advisor" value={data.advisor.name} />
                <Info label="Created" value={formatDate(data.createdAt)} />
                {data.notes ? <Info label="Notes" value={data.notes} /> : null}
              </View>

              {/* 4 — Timeline */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Timeline</Text>
                {events.filter((e) =>
                  TECH_TIMELINE_EVENTS.includes(e.eventType),
                ).length === 0 ? (
                  <Text style={styles.emptyText}>No events yet.</Text>
                ) : (
                  events
                    .filter((e) => TECH_TIMELINE_EVENTS.includes(e.eventType))
                    .map((event) => (
                      <View key={event.id} style={styles.eventRow}>
                        <View style={styles.eventDot} />
                        <View style={styles.eventBody}>
                          <View style={styles.eventHeader}>
                            <Text style={styles.eventType}>
                              {statusLabel(event.eventType)}
                            </Text>
                            {event.createdByName ? (
                              <Text
                                style={styles.eventCreator}
                                numberOfLines={1}
                              >
                                {event.createdByName}
                              </Text>
                            ) : null}
                          </View>
                          {(event.metadata?.from != null ||
                            event.metadata?.to != null) && (
                            <Text style={styles.eventFromTo}>
                              {event.eventType === "case_transferred"
                                ? `${String(event.metadata?.fromName ?? event.metadata?.from ?? "")} → ${String(event.metadata?.toName ?? event.metadata?.to ?? "")}`
                                : `${statusLabel(String(event.metadata?.from ?? ""))} → ${statusLabel(String(event.metadata?.to ?? ""))}`}
                            </Text>
                          )}
                          {event.message ? (
                            <Text style={styles.eventMsg}>{event.message}</Text>
                          ) : null}
                          <Text style={styles.eventTime}>
                            {formatDate(event.createdAt)}
                          </Text>
                        </View>
                      </View>
                    ))
                )}
              </View>

              {/* 5 — Final submit */}
              <Pressable
                onPress={handleSubmitToAdvisor}
                disabled={notifyMutation.isPending || submitDone}
                style={[
                  styles.submitBtn,
                  (notifyMutation.isPending || submitDone) && styles.disabled,
                ]}
              >
                {notifyMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : submitDone ? (
                  <>
                    <Feather name="check" size={15} color="#fff" />
                    <Text style={styles.submitBtnText}>
                      Submitted to Advisor
                    </Text>
                  </>
                ) : (
                  <>
                    <Feather name="send" size={15} color="#fff" />
                    <Text style={styles.submitBtnText}>Submit to Advisor</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {/* WhatsApp */}
              {canUseWhatsApp && data && (
                <WhatsAppCard
                  data={data}
                  waStatusQuery={waStatusQuery}
                  waInitiated={waInitiated}
                  setWaInitiated={setWaInitiated}
                  createGroupMutation={createGroupMutation}
                  setWaSendOpen={setWaSendOpen}
                  setWaCreateOpen={setWaCreateOpen}
                  setWaInitialMsg={setWaInitialMsg}
                  showToast={showToast}
                />
              )}

              {/* Info */}
              <View style={styles.card}>
                <Info label="KM Count" value={data.kmCount} />
                <Info label="Due Date" value={data.dueDate} />
                <Info label="Delivery Type" value={data.deliveryType} />
                <Info label="Customer Phone" value={data.customerPhone} />
                {data.customerArrivalStatus ? (
                  <Info
                    label="Arrival Status"
                    value={
                      ARRIVAL_LABELS[data.customerArrivalStatus] ??
                      data.customerArrivalStatus
                    }
                  />
                ) : null}
                {data.serviceType ? (
                  <Info
                    label="Service Type"
                    value={
                      data.serviceType === "service"
                        ? `Service${data.serviceSubType ? ` — ${SERVICE_SUB_LABELS[data.serviceSubType] ?? data.serviceSubType}` : ""}`
                        : "Repair"
                    }
                  />
                ) : null}
                <Info
                  label="Advisor"
                  value={`${data.advisor.name} (${data.advisor.phone})`}
                />
                <Info label="Created" value={formatDate(data.createdAt)} />
                {data.notes ? <Info label="Notes" value={data.notes} /> : null}
                <Pressable
                  onPress={handleShareCaseInternally}
                  style={styles.shareInternalBtn}
                >
                  <Feather
                    name="share-2"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.shareInternalText}>
                    Share Case Details
                  </Text>
                </Pressable>
                {canEditCase && (
                  <Pressable
                    onPress={() => {
                      setEditForm({
                        vehicleNumber: data.vehicleNumber,
                        carModel: data.carModel,
                        customerPhone: data.customerPhone ?? "",
                        kmCount: data.kmCount ?? "",
                        dueDate: data.dueDate ?? "",
                        deliveryType: data.deliveryType ?? "",
                        notes: data.notes ?? "",
                        customerArrivalStatus: data.customerArrivalStatus ?? "",
                        serviceType: data.serviceType ?? "",
                        serviceSubType: data.serviceSubType ?? "",
                      });
                      setEditOpen(true);
                    }}
                    style={styles.editDetailsBtn}
                  >
                    <Feather name="edit-2" size={13} color={colors.primary} />
                    <Text style={styles.editDetailsText}>Edit Details</Text>
                  </Pressable>
                )}
              </View>

              {/* Internal status */}
              <StatusSection
                title="Internal Status"
                status={
                  <StatusBadge status={data.internalStatus} type="internal" />
                }
                canUpdate={canUpdateInternal}
                onUpdate={() => {
                  setSelectedInternal(data.internalStatus);
                  setInternalOpen(true);
                }}
              />

              {/* Customer status */}
              <StatusSection
                title="Customer Status"
                status={
                  <StatusBadge status={data.customerStatus} type="customer" />
                }
                canUpdate={canUpdate}
                onUpdate={() => {
                  setSelectedCustomer(data.customerStatus);
                  setCustomerOpen(true);
                }}
              />

              {/* Timeline */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Timeline</Text>
                {events.length === 0 ? (
                  <Text style={styles.emptyText}>No events yet.</Text>
                ) : (
                  events.map((event) => (
                    <View key={event.id} style={styles.eventRow}>
                      <View style={styles.eventDot} />
                      <View style={styles.eventBody}>
                        <View style={styles.eventHeader}>
                          <Text style={styles.eventType}>
                            {statusLabel(event.eventType)}
                          </Text>
                          {event.createdByName ? (
                            <Text style={styles.eventCreator} numberOfLines={1}>
                              {event.createdByName}
                            </Text>
                          ) : null}
                        </View>
                        {(event.metadata?.from != null ||
                          event.metadata?.to != null) && (
                          <Text style={styles.eventFromTo}>
                            {statusLabel(String(event.metadata?.from ?? ""))} →{" "}
                            {statusLabel(String(event.metadata?.to ?? ""))}
                          </Text>
                        )}
                        {event.message ? (
                          <Text style={styles.eventMsg}>{event.message}</Text>
                        ) : null}
                        <Text style={styles.eventTime}>
                          {formatDate(event.createdAt)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <AddEventForm
                caseNumber={caseNumber}
                role={role}
                onSuccess={() => {}}
              />

              {/* Photos */}
              <View style={styles.card}>
                <View style={styles.tabRow}>
                  <Pressable
                    onPress={() => setImageFolder("intake")}
                    style={[
                      styles.tab,
                      imageFolder === "intake" && styles.tabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        imageFolder === "intake" && styles.tabTextActive,
                      ]}
                    >
                      Intake Photos
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setImageFolder("repairs")}
                    style={[
                      styles.tab,
                      imageFolder === "repairs" && styles.tabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        imageFolder === "repairs" && styles.tabTextActive,
                      ]}
                    >
                      Repair Photos
                    </Text>
                  </Pressable>
                </View>
                {imageFolder === "intake" ? (
                  <ImagesGrid
                    caseNumber={caseNumber}
                    folder="intake"
                    role={role}
                    onImageView={(imgs, idx) => {
                      const item = imgs[idx];
                      if (item.mediaType === "video") {
                        setVideoViewerItem(item);
                      } else {
                        const onlyImages = imgs.filter(
                          (m) => m.mediaType !== "video",
                        );
                        const startIndex = onlyImages.findIndex(
                          (m) => m.id === item.id,
                        );
                        setImageViewerState({
                          images: onlyImages,
                          startIndex: Math.max(0, startIndex),
                        });
                      }
                    }}
                  />
                ) : (
                  <ImagesGrid
                    caseNumber={caseNumber}
                    folder="repairs"
                    role={role}
                    onImageView={(imgs, idx) => {
                      const item = imgs[idx];
                      if (item.mediaType === "video") {
                        setVideoViewerItem(item);
                      } else {
                        const onlyImages = imgs.filter(
                          (m) => m.mediaType !== "video",
                        );
                        const startIndex = onlyImages.findIndex(
                          (m) => m.id === item.id,
                        );
                        setImageViewerState({
                          images: onlyImages,
                          startIndex: Math.max(0, startIndex),
                        });
                      }
                    }}
                  />
                )}
              </View>

              {isAdmin && (
                <>
                  <Pressable
                    onPress={() => {
                      setTransferAdvisorId(null);
                      setTransferNote("");
                      setTransferOpen(true);
                    }}
                    style={styles.transferCaseBtn}
                  >
                    <Feather name="shuffle" size={15} color={colors.primary} />
                    <Text style={styles.transferCaseBtnText}>
                      Transfer Case
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteCase}
                    disabled={deleteMutation.isPending}
                    style={[
                      styles.deleteCaseBtn,
                      deleteMutation.isPending && styles.disabled,
                    ]}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator
                        color={colors.destructive}
                        size="small"
                      />
                    ) : (
                      <>
                        <Feather
                          name="trash-2"
                          size={15}
                          color={colors.destructive}
                        />
                        <Text style={styles.deleteCaseBtnText}>
                          Delete Case
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      <StatusPickerModal
        visible={internalOpen}
        title="Update Internal Status"
        statuses={isTechnician ? TECHNICIAN_STATUSES : INTERNAL_STATUSES}
        selected={selectedInternal}
        onSelect={(status) => setSelectedInternal(status as InternalStatus)}
        note={note}
        onNoteChange={setNote}
        showNote
        loading={internalMutation.isPending}
        onClose={() => setInternalOpen(false)}
        onSave={() => internalMutation.mutate()}
      />
      <StatusPickerModal
        visible={customerOpen}
        title="Update Customer Status"
        statuses={CUSTOMER_STATUSES}
        selected={selectedCustomer}
        onSelect={(status) => setSelectedCustomer(status as CustomerStatus)}
        loading={customerMutation.isPending}
        onClose={() => setCustomerOpen(false)}
        onSave={() => customerMutation.mutate()}
      />

      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Edit Case Details</Text>
            <ScrollView style={styles.editFormScroll}>
              <EditField
                label="Vehicle Number"
                value={editForm.vehicleNumber ?? ""}
                onChangeText={(v) =>
                  setEditForm({ ...editForm, vehicleNumber: v.toUpperCase() })
                }
                required
              />
              <EditField
                label="Car Model"
                value={editForm.carModel ?? ""}
                onChangeText={(v) => setEditForm({ ...editForm, carModel: v })}
                required
              />
              <EditField
                label="Customer Phone"
                value={editForm.customerPhone ?? ""}
                onChangeText={(v) =>
                  setEditForm({ ...editForm, customerPhone: v })
                }
                keyboardType="phone-pad"
              />
              <EditField
                label="KM Count"
                value={editForm.kmCount ?? ""}
                onChangeText={(v) => setEditForm({ ...editForm, kmCount: v })}
                keyboardType="numeric"
              />
              {/* Due Date */}
              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>Due Date</Text>
                <View style={styles.editChipRow}>
                  {(
                    [
                      { id: "today", label: "Same Day" },
                      { id: "tomorrow", label: "Tomorrow" },
                      { id: "day-after", label: "Day After" },
                    ] as const
                  ).map((opt) => (
                    <Pressable
                      key={opt.id}
                      onPress={() =>
                        setEditForm({
                          ...editForm,
                          dueDate: editForm.dueDate === opt.id ? "" : opt.id,
                        })
                      }
                      style={[
                        styles.editChip,
                        editForm.dueDate === opt.id && styles.editChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.editChipText,
                          editForm.dueDate === opt.id &&
                            styles.editChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <EditField
                label="Delivery Type"
                value={editForm.deliveryType ?? ""}
                onChangeText={(v) =>
                  setEditForm({ ...editForm, deliveryType: v })
                }
              />
              <EditField
                label="Notes"
                value={editForm.notes ?? ""}
                onChangeText={(v) => setEditForm({ ...editForm, notes: v })}
                multiline
              />

              {/* Arrival Status */}
              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>Arrival Status</Text>
                <View style={styles.editChipRow}>
                  {(
                    [
                      "walk_in",
                      "pickup",
                      "customer_waiting",
                      "breakdown",
                    ] as const
                  ).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() =>
                        setEditForm({
                          ...editForm,
                          customerArrivalStatus:
                            editForm.customerArrivalStatus === s ? "" : s,
                        })
                      }
                      style={[
                        styles.editChip,
                        editForm.customerArrivalStatus === s &&
                          styles.editChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.editChipText,
                          editForm.customerArrivalStatus === s &&
                            styles.editChipTextActive,
                        ]}
                      >
                        {ARRIVAL_LABELS[s]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Service Type */}
              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>Service Type</Text>
                <View style={styles.editChipRow}>
                  {(["service", "repair"] as const).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() =>
                        setEditForm({
                          ...editForm,
                          serviceType: editForm.serviceType === s ? "" : s,
                          serviceSubType:
                            s === "repair" ? "" : editForm.serviceSubType,
                        })
                      }
                      style={[
                        styles.editChip,
                        editForm.serviceType === s && styles.editChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.editChipText,
                          editForm.serviceType === s &&
                            styles.editChipTextActive,
                        ]}
                      >
                        {s === "service" ? "Service" : "Repair"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Service Sub-Type — only when Service selected */}
              {editForm.serviceType === "service" && (
                <View style={styles.editField}>
                  <Text style={styles.editFieldLabel}>Service Sub-Type</Text>
                  <View style={styles.editChipRow}>
                    {(["major", "minor", "breakdown", "running"] as const).map(
                      (s) => (
                        <Pressable
                          key={s}
                          onPress={() =>
                            setEditForm({
                              ...editForm,
                              serviceSubType:
                                editForm.serviceSubType === s ? "" : s,
                            })
                          }
                          style={[
                            styles.editChip,
                            editForm.serviceSubType === s &&
                              styles.editChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.editChipText,
                              editForm.serviceSubType === s &&
                                styles.editChipTextActive,
                            ]}
                          >
                            {SERVICE_SUB_LABELS[s]}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              )}

              {editMutation.isError && (
                <Text style={styles.editErrorText}>
                  {editMutation.error instanceof Error
                    ? editMutation.error.message
                    : "Save failed."}
                </Text>
              )}

              <Pressable
                onPress={handleEditSave}
                disabled={
                  editMutation.isPending ||
                  !editForm.vehicleNumber?.trim() ||
                  !editForm.carModel?.trim()
                }
                style={[
                  styles.saveBtn,
                  (editMutation.isPending ||
                    !editForm.vehicleNumber?.trim() ||
                    !editForm.carModel?.trim()) &&
                    styles.disabled,
                ]}
              >
                {editMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={styles.sheetCancel}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Image viewer — react-native-image-viewing handles pinch/swipe/zoom */}
      <ImageViewing
        images={
          imageViewerState
            ? imageViewerState.images.map((m) => ({ uri: m.url }))
            : []
        }
        imageIndex={imageViewerState?.startIndex ?? 0}
        visible={!!imageViewerState}
        onRequestClose={() => setImageViewerState(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        HeaderComponent={({ imageIndex }) => {
          const img = imageViewerState!.images[imageIndex];
          return (
            <View
              style={[
                styles.viewerHeader,
                { paddingTop: Math.max(insets.top, 16) },
              ]}
            >
              <Pressable
                style={styles.viewerHeaderBtn}
                onPress={() => setImageViewerState(null)}
                hitSlop={12}
              >
                <Feather name="x" size={22} color="#fff" />
              </Pressable>
              <Text style={styles.viewerCounter}>
                {imageIndex + 1} / {imageViewerState!.images.length}
              </Text>
              <Pressable
                style={[
                  styles.viewerHeaderBtn,
                  downloadingImage && styles.disabled,
                ]}
                onPress={() => handleDownloadImage(img)}
                disabled={downloadingImage}
                hitSlop={12}
              >
                {downloadingImage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="download" size={22} color="#fff" />
                )}
              </Pressable>
            </View>
          );
        }}
        FooterComponent={({ imageIndex }) => {
          const img = imageViewerState!.images[imageIndex];
          return (
            <View style={styles.viewerFooter}>
              {img.isPrimary && (
                <View style={styles.viewerPrimaryBadge}>
                  <Feather name="star" size={10} color="#fff" />
                  <Text style={styles.viewerPrimaryText}>Primary</Text>
                </View>
              )}
              <Text style={styles.viewerFilename} numberOfLines={1}>
                {img.filename}
              </Text>
              <Text style={styles.viewerMeta}>
                {img.folder === "intake" ? "Intake" : "Repairs"} ·{" "}
                {formatDate(img.createdAt)}
              </Text>
            </View>
          );
        }}
      />

      {/* Video viewer */}
      <Modal
        visible={!!videoViewerItem}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVideoViewerItem(null)}
      >
        {videoViewerItem && (
          <View style={styles.viewerBackdrop}>
            <View
              style={[
                styles.viewerHeader,
                { paddingTop: Math.max(insets.top, 16) },
              ]}
            >
              <Pressable
                style={styles.viewerHeaderBtn}
                onPress={() => setVideoViewerItem(null)}
                hitSlop={12}
              >
                <Feather name="x" size={22} color="#fff" />
              </Pressable>
              <Text style={styles.viewerCounter}>
                {videoViewerItem.filename}
              </Text>
              <Pressable
                style={[
                  styles.viewerHeaderBtn,
                  downloadingImage && styles.disabled,
                ]}
                onPress={() => handleDownloadImage(videoViewerItem)}
                disabled={downloadingImage}
                hitSlop={12}
              >
                {downloadingImage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="download" size={22} color="#fff" />
                )}
              </Pressable>
            </View>
            <View style={styles.viewerImageArea}>
              <VideoViewerContent url={videoViewerItem.url} />
            </View>
            <View style={styles.viewerFooter}>
              <Text style={styles.viewerMeta}>
                {videoViewerItem.folder === "intake" ? "Intake" : "Repairs"} ·{" "}
                {formatDate(videoViewerItem.createdAt)}
              </Text>
            </View>
          </View>
        )}
      </Modal>

      <Modal
        visible={waCreateOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setWaCreateOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create WhatsApp Group</Text>
            <Text style={styles.waGroupMeta}>
              Group will include customer
              {data?.customerPhone ? ` (${data.customerPhone})` : ""} and you (
              {data?.advisor.phone ?? "your number"}).
            </Text>
            <TextInput
              value={waInitialMsg}
              onChangeText={setWaInitialMsg}
              placeholder="Initial message (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              returnKeyType="done"
              blurOnSubmit
              style={[styles.editFieldInput, styles.editFieldTextarea]}
            />
            <Pressable
              onPress={() =>
                createGroupMutation.mutate({
                  phone: data?.advisor.phone ?? "",
                  msg: waInitialMsg.trim() || undefined,
                })
              }
              disabled={createGroupMutation.isPending}
              style={[
                styles.saveBtn,
                createGroupMutation.isPending && styles.disabled,
              ]}
            >
              {createGroupMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Create Group</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setWaCreateOpen(false)}
              style={styles.sheetCancel}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={waSendOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setWaSendOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send Update</Text>
            <TextInput
              value={waSendMsg}
              onChangeText={setWaSendMsg}
              placeholder="Type your update message..."
              placeholderTextColor={colors.textMuted}
              multiline
              returnKeyType="done"
              blurOnSubmit
              style={[styles.editFieldInput, styles.editFieldTextarea]}
            />
            <Pressable
              onPress={() => sendMsgMutation.mutate(waSendMsg.trim())}
              disabled={!waSendMsg.trim() || sendMsgMutation.isPending}
              style={[
                styles.saveBtn,
                (!waSendMsg.trim() || sendMsgMutation.isPending) &&
                  styles.disabled,
              ]}
            >
              {sendMsgMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Send Message</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setWaSendOpen(false)}
              style={styles.sheetCancel}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={transferOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTransferOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Transfer Case</Text>
            <Text style={styles.transferSubtitle}>
              Currently: {data?.advisor.name}
            </Text>

            {advisorsQuery.isLoading ? (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginVertical: 16 }}
              />
            ) : (
              <ScrollView
                style={styles.advisorPickerList}
                showsVerticalScrollIndicator={false}
              >
                {(advisorsQuery.data ?? [])
                  .filter((a: UserListItem) => a.id !== data?.advisorId)
                  .map((advisor: UserListItem) => (
                    <Pressable
                      key={advisor.id}
                      onPress={() => setTransferAdvisorId(advisor.id)}
                      style={[
                        styles.advisorPickerRow,
                        transferAdvisorId === advisor.id &&
                          styles.advisorPickerRowActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.advisorPickerAvatar,
                          transferAdvisorId === advisor.id &&
                            styles.advisorPickerAvatarActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.advisorPickerAvatarText,
                            transferAdvisorId === advisor.id &&
                              styles.advisorPickerAvatarTextActive,
                          ]}
                        >
                          {advisor.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.advisorPickerInfo}>
                        <Text style={styles.advisorPickerName}>
                          {advisor.name}
                        </Text>
                        <Text style={styles.advisorPickerRole}>
                          {advisor.role}
                        </Text>
                      </View>
                      {transferAdvisorId === advisor.id && (
                        <Feather
                          name="check"
                          size={16}
                          color={colors.primary}
                        />
                      )}
                    </Pressable>
                  ))}
              </ScrollView>
            )}

            <TextInput
              value={transferNote}
              onChangeText={setTransferNote}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textMuted}
              style={styles.noteInput}
              maxLength={500}
            />

            {transferMutation.isError && (
              <Text style={styles.editErrorText}>
                {transferMutation.error instanceof Error
                  ? transferMutation.error.message
                  : "Transfer failed."}
              </Text>
            )}

            <Pressable
              onPress={() => transferMutation.mutate()}
              disabled={!transferAdvisorId || transferMutation.isPending}
              style={[
                styles.saveBtn,
                (!transferAdvisorId || transferMutation.isPending) &&
                  styles.disabled,
              ]}
            >
              {transferMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Transfer Case</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setTransferOpen(false)}
              style={styles.sheetCancel}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "-"}</Text>
    </View>
  );
}

function StatusSection({
  title,
  status,
  canUpdate,
  onUpdate,
}: {
  title: string;
  status: React.ReactNode;
  canUpdate: boolean;
  onUpdate: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.statusHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {canUpdate ? (
          <Pressable onPress={onUpdate} style={styles.updateBtn}>
            <Text style={styles.updateText}>Update</Text>
          </Pressable>
        ) : null}
      </View>
      {status}
    </View>
  );
}

function StatusPickerModal({
  visible,
  title,
  statuses,
  selected,
  onSelect,
  note,
  onNoteChange,
  showNote,
  loading,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  statuses: string[];
  selected: string;
  onSelect: (status: string) => void;
  note?: string;
  onNoteChange?: (note: string) => void;
  showNote?: boolean;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.currentStatus}>
            Currently: {statusLabel(selected)}
          </Text>
          <View style={styles.statusGrid}>
            {statuses.map((status) => (
              <Pressable
                key={status}
                onPress={() => onSelect(status)}
                style={[
                  styles.statusOption,
                  selected === status && styles.statusOptionActive,
                ]}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    selected === status && styles.statusOptionTextActive,
                  ]}
                >
                  {statusLabel(status)}
                </Text>
              </Pressable>
            ))}
          </View>
          {showNote ? (
            <TextInput
              value={note}
              onChangeText={onNoteChange}
              placeholder="Optional note"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.noteInput}
            />
          ) : null}
          <Pressable
            onPress={onSave}
            disabled={loading}
            style={[styles.saveBtn, loading && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Save Status</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function WhatsAppCard({
  data,
  waStatusQuery,
  waInitiated,
  setWaInitiated,
  createGroupMutation,
  setWaSendOpen,
  setWaCreateOpen,
  setWaInitialMsg,
  showToast,
}: {
  data: CaseDetail;
  waStatusQuery: ReturnType<typeof useWhatsAppStatus>;
  waInitiated: boolean;
  setWaInitiated: (v: boolean) => void;
  createGroupMutation: UseMutationResult<
    CreateGroupResult,
    Error,
    { phone: string; msg?: string }
  >;
  setWaSendOpen: (v: boolean) => void;
  setWaCreateOpen: (v: boolean) => void;
  setWaInitialMsg: (v: string) => void;
  showToast: (msg: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>WhatsApp Group</Text>
      {waStatusQuery.isLoading && !waStatusQuery.data ? (
        <ActivityIndicator color={colors.primary} style={styles.waLoading} />
      ) : waStatusQuery.data?.whatsappStatus === "created" ? (
        <View>
          <View style={styles.waSuccessRow}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.waSuccessText}>Group Created</Text>
          </View>
          {waStatusQuery.data.whatsappInviteLink ? (
            <View style={styles.waInviteRow}>
              <Text style={styles.waInviteLabel}>Invite Link</Text>
              <View style={styles.waInviteLinkRow}>
                <Text style={styles.waInviteLink} numberOfLines={1}>
                  {waStatusQuery.data.whatsappInviteLink}
                </Text>
                <Pressable
                  onPress={() => {
                    Clipboard.setStringAsync(
                      waStatusQuery.data!.whatsappInviteLink!,
                    );
                    showToast("Link copied");
                  }}
                  style={styles.waCopyBtn}
                >
                  <Feather name="copy" size={14} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          ) : null}
          <Pressable
            onPress={() => setWaSendOpen(true)}
            style={styles.waSendBtn}
          >
            <Feather name="send" size={14} color="#fff" />
            <Text style={styles.waSendText}>Send Update</Text>
          </Pressable>
        </View>
      ) : waStatusQuery.data?.whatsappStatus === "failed" ? (
        <View>
          <View style={styles.waFailRow}>
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={styles.waFailText}>Group creation failed</Text>
          </View>
          <Pressable
            onPress={() => {
              setWaInitiated(true);
              createGroupMutation.mutate({
                phone: data.advisor.phone,
                msg: formatCaseMessage(data),
              });
            }}
            style={styles.waRetryBtn}
          >
            <Text style={styles.waRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : waStatusQuery.data?.whatsappStatus === "manual_required" ? (
        <View>
          <View style={styles.waFailRow}>
            <Feather name="help-circle" size={16} color="#B54708" />
            <Text style={styles.waManualText}>Session Disconnected</Text>
          </View>
          <Text style={styles.waManualDesc}>
            The server WhatsApp session is disconnected. Ask admin to re-scan
            the QR code, then retry.
          </Text>
          <Pressable
            onPress={() => Linking.openURL("whatsapp://send")}
            style={styles.waOpenBtn}
          >
            <Feather name="message-circle" size={14} color="#25D366" />
            <Text style={styles.waOpenBtnText}>Open WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setWaInitiated(true);
              createGroupMutation.mutate({
                phone: data.advisor.phone,
                msg: formatCaseMessage(data),
              });
            }}
            style={styles.waRetryBtn}
          >
            <Text style={styles.waRetryText}>Retry Group Creation</Text>
          </Pressable>
        </View>
      ) : waInitiated ||
        waStatusQuery.data?.whatsappStatus === "pending" ||
        waStatusQuery.data?.whatsappStatus === "retrying" ? (
        <View style={styles.waCreatingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.waCreatingText}>Creating group...</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.waNoGroupText}>
            No WhatsApp group created yet
          </Text>
          <Pressable
            onPress={() => {
              setWaInitialMsg(data ? formatCaseMessage(data) : "");
              setWaCreateOpen(true);
            }}
            style={styles.waCreateBtn}
          >
            <Feather name="users" size={14} color="#fff" />
            <Text style={styles.waCreateText}>Create WhatsApp Group</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("whatsapp://send")}
            style={styles.waOpenBtn}
          >
            <Feather name="message-circle" size={14} color="#25D366" />
            <Text style={styles.waOpenBtnText}>Open WhatsApp Manually</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric" | "phone-pad";
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editFieldLabel}>
        {label}
        {required ? <Text style={styles.editRequired}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={[styles.editFieldInput, multiline && styles.editFieldTextarea]}
      />
    </View>
  );
}

function ImagesGrid({
  caseNumber,
  folder,
  role,
  canUpload = true,
  onImageView,
}: {
  caseNumber: string;
  folder: "intake" | "repairs";
  role: string | undefined;
  canUpload?: boolean;
  onImageView: (images: CaseEventImage[], index: number) => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: images,
    isLoading,
    refetch,
  } = useCaseImages(caseNumber, folder);
  const [uploading, setUploading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<
    "download" | "share" | "delete" | null
  >(null);

  const canPrivileged =
    role === "superadmin" || role === "admin" || role === "advisor";

  const toggleSelect = (id: number) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectedImages = (images ?? []).filter((img) =>
    selectedIds.has(img.id),
  );

  const isExpoGo = Constants.appOwnership === "expo";

  const handleBulkDownload = async () => {
    if (selectedImages.length === 0) return;
    if (isExpoGo) {
      Alert.alert(
        "Dev Build Required",
        "Saving to the photo library requires a development build. Run: eas build --profile development",
        [{ text: "OK" }],
      );
      return;
    }
    setBulkAction("download");
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Allow photo library access in Settings to save images.",
        );
        return;
      }
      const saveResults = await Promise.allSettled(
        selectedImages.map(async (img) => {
          const ext = img.url.split("?")[0].split(".").pop() ?? "jpg";
          const localUri = `${FileSystem.cacheDirectory}ym_${img.id}_${Date.now()}.${ext}`;
          const { uri } = await FileSystem.downloadAsync(img.url, localUri);
          await MediaLibrary.saveToLibraryAsync(uri);
        }),
      );
      const saved = saveResults.filter((r) => r.status === "fulfilled").length;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Saved",
        `${saved} image${saved !== 1 ? "s" : ""} saved to photo library.`,
      );
      exitSelectMode();
    } catch (e) {
      Alert.alert(
        "Download failed",
        e instanceof Error ? e.message : "Could not save images.",
      );
    } finally {
      setBulkAction(null);
    }
  };

  const handleBulkShare = async () => {
    if (selectedImages.length === 0) return;
    setBulkAction("share");
    try {
      // Only images for multi-share (WhatsApp requires homogeneous image/* type)
      const imageItems = selectedImages.filter(
        (img) => img.mediaType !== "video",
      );
      if (imageItems.length === 0) {
        Alert.alert("Images only", "Select at least one image to share.");
        return;
      }

      // Download to stable cache paths
      const localPaths = await Promise.all(
        imageItems.map(async (img) => {
          const dest = `${FileSystem.cacheDirectory}rns_${img.id}.jpg`;
          await FileSystem.downloadAsync(img.url, dest);
          return dest;
        }),
      );

      console.log(localPaths);
      if (!RNShare) {
        Alert.alert(
          "Not supported",
          "Sharing requires a dev/production build.",
        );
        return;
      }
      // react-native-share with useInternalStorage copies files into the app's
      // internal FileProvider directory, granting WhatsApp and WhatsApp Business
      // proper content:// URI access via ACTION_SEND_MULTIPLE.
      await RNShare.open({
        urls: localPaths,
        type: "image/*",
        useInternalStorage: true,
        title: "Share images",
        failOnCancel: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !msg.toLowerCase().includes("cancel") &&
        !msg.toLowerCase().includes("user did not share") &&
        !msg.toLowerCase().includes("dismissed")
      ) {
        Alert.alert("Share failed", "Could not share images. Try again.");
      }
    } finally {
      setBulkAction(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedImages.length === 0) return;
    Alert.alert(
      "Delete Images",
      `Remove ${selectedIds.size} image${selectedIds.size !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (bulkAction) return;
            setBulkAction("delete");
            try {
              const results = await Promise.allSettled(
                selectedImages.map((img) => deleteImage(caseNumber, img.id)),
              );
              const realFails = results.filter(
                (r): r is PromiseRejectedResult => {
                  if (r.status !== "rejected") return false;
                  const msg =
                    r.reason instanceof Error
                      ? r.reason.message.toLowerCase()
                      : "";
                  return !msg.includes("not found");
                },
              );
              queryClient.invalidateQueries({
                queryKey: ["images", caseNumber, folder],
              });
              queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
              exitSelectMode();
              if (realFails.length > 0) {
                Alert.alert(
                  "Partial failure",
                  `${realFails.length} image${realFails.length !== 1 ? "s" : ""} could not be deleted.`,
                );
              }
            } catch (e) {
              Alert.alert(
                "Error",
                e instanceof Error ? e.message : "Failed to delete images.",
              );
            } finally {
              setBulkAction(null);
            }
          },
        },
      ],
    );
  };

  const pickImages = (): Promise<string[]> =>
    new Promise((resolve) => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Take Photo / Video", "Choose from Gallery"],
            cancelButtonIndex: 0,
          },
          async (idx) => {
            if (idx === 1) {
              const { status } =
                await ImagePickerLib.requestCameraPermissionsAsync();
              if (status !== "granted") {
                resolve([]);
                return;
              }
              const r = await ImagePickerLib.launchCameraAsync({
                quality: 0.85,
                mediaTypes: ["images", "videos"],
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            } else if (idx === 2) {
              const { status } =
                await ImagePickerLib.requestMediaLibraryPermissionsAsync();
              if (status !== "granted") {
                resolve([]);
                return;
              }
              const r = await ImagePickerLib.launchImageLibraryAsync({
                quality: 0.85,
                allowsMultipleSelection: true,
                mediaTypes: ["images", "videos"],
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            } else {
              resolve([]);
            }
          },
        );
      } else {
        Alert.alert("Add Photo / Video", "Choose source", [
          {
            text: "Take Photo / Video",
            onPress: async () => {
              const { status } =
                await ImagePickerLib.requestCameraPermissionsAsync();
              if (status !== "granted") {
                resolve([]);
                return;
              }
              const r = await ImagePickerLib.launchCameraAsync({
                quality: 0.85,
                mediaTypes: ["images", "videos"],
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            },
          },
          {
            text: "Choose from Gallery",
            onPress: async () => {
              const { status } =
                await ImagePickerLib.requestMediaLibraryPermissionsAsync();
              if (status !== "granted") {
                resolve([]);
                return;
              }
              const r = await ImagePickerLib.launchImageLibraryAsync({
                quality: 0.85,
                allowsMultipleSelection: true,
                mediaTypes: ["images", "videos"],
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            },
          },
          { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
        ]);
      }
    });

  const getMimeType = (
    uri: string,
  ): { mime: string; ext: string; isVideo: boolean } => {
    const lower = uri.split("?")[0].toLowerCase();
    if (lower.endsWith(".mp4"))
      return { mime: "video/mp4", ext: "mp4", isVideo: true };
    if (lower.endsWith(".mov"))
      return { mime: "video/quicktime", ext: "mov", isVideo: true };
    if (lower.endsWith(".heic"))
      return { mime: "image/heic", ext: "heic", isVideo: false };
    if (lower.endsWith(".heif"))
      return { mime: "image/heif", ext: "heif", isVideo: false };
    if (lower.endsWith(".png"))
      return { mime: "image/png", ext: "png", isVideo: false };
    if (lower.endsWith(".webp"))
      return { mime: "image/webp", ext: "webp", isVideo: false };
    return { mime: "image/jpeg", ext: "jpg", isVideo: false };
  };

  const handleAdd = async () => {
    const uris = await pickImages();
    if (uris.length === 0) return;
    setUploading(true);

    const results = await Promise.allSettled(
      uris.map(async (uri) => {
        const { mime, ext, isVideo } = getMimeType(uri);
        const filename = `${Array.from({ length: 4 }, () =>
          String.fromCharCode(97 + Math.floor(Math.random() * 26)),
        ).join("")}.${ext}`;
        const presigned = await presignImage(caseNumber, {
          filename,
          contentType: mime,
          folder,
        });
        await uploadImageToS3(presigned.uploadUrl, uri, mime);
        return {
          key: presigned.key,
          filename,
          folder,
          mediaType: isVideo ? "video" : "image",
        } as ConfirmImageItem;
      }),
    );

    const confirmed = results
      .filter(
        (r): r is PromiseFulfilledResult<ConfirmImageItem> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
    const failedCount = results.filter((r) => r.status === "rejected").length;

    if (confirmed.length > 0) {
      try {
        await confirmImages(caseNumber, confirmed);
      } catch (e) {
        Alert.alert(
          "Upload Error",
          e instanceof Error ? e.message : "Failed to save image records.",
        );
        setUploading(false);
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["images", caseNumber, folder] });
    queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
    setUploading(false);
    if (failedCount > 0)
      Alert.alert(
        "Upload Complete",
        `${confirmed.length} uploaded, ${failedCount} failed`,
      );
  };

  const imageList = images ?? [];
  const isBusy = !!bulkAction;

  return (
    <View>
      {isLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.imagesLoading}
        />
      ) : imageList.length === 0 ? (
        <View style={styles.emptyImages}>
          <Feather name="image" size={24} color={colors.textMuted} />
          <Text style={styles.emptyImagesText}>No photos yet</Text>
          <Text style={styles.emptyImagesSub}>
            Tap "Add Photos" to upload images
          </Text>
        </View>
      ) : (
        <View style={styles.imageGrid}>
          {imageList.map((img) => (
            <ImageThumbnail
              key={img.id}
              image={img}
              selectMode={selectMode}
              selected={selectedIds.has(img.id)}
              onPress={() => {
                if (selectMode) {
                  toggleSelect(img.id);
                } else {
                  onImageView(imageList, imageList.indexOf(img));
                }
              }}
              onLongPress={
                !selectMode && canPrivileged
                  ? () => {
                      setSelectMode(true);
                      toggleSelect(img.id);
                    }
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {selectMode ? (
        <View style={styles.selectBar}>
          <Pressable
            onPress={exitSelectMode}
            style={styles.cancelSelectBtn}
            disabled={isBusy}
          >
            <Text style={styles.cancelSelectText}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectedCount}>{selectedIds.size} selected</Text>
          <View style={styles.bulkBtns}>
            <Pressable
              onPress={handleBulkDownload}
              disabled={selectedIds.size === 0 || isBusy}
              style={[
                styles.bulkBtn,
                (selectedIds.size === 0 || isBusy) && styles.disabled,
              ]}
            >
              {bulkAction === "download" ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Feather name="download" size={18} color={colors.primary} />
              )}
            </Pressable>
            <Pressable
              onPress={handleBulkShare}
              disabled={selectedIds.size === 0 || isBusy}
              style={[
                styles.bulkBtn,
                (selectedIds.size === 0 || isBusy) && styles.disabled,
              ]}
            >
              {bulkAction === "share" ? (
                <ActivityIndicator color="#25D366" size="small" />
              ) : (
                <Feather name="share-2" size={18} color="#25D366" />
              )}
            </Pressable>
            {canPrivileged && (
              <Pressable
                onPress={handleBulkDelete}
                disabled={selectedIds.size === 0 || isBusy}
                style={[
                  styles.bulkBtn,
                  styles.bulkBtnDanger,
                  (selectedIds.size === 0 || isBusy) && styles.disabled,
                ]}
              >
                {bulkAction === "delete" ? (
                  <ActivityIndicator color={colors.destructive} size="small" />
                ) : (
                  <Feather
                    name="trash-2"
                    size={18}
                    color={colors.destructive}
                  />
                )}
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.imageActions}>
          {canUpload && (
            <Pressable
              onPress={handleAdd}
              disabled={uploading}
              style={[styles.addPhotoBtn, uploading && styles.disabled]}
            >
              {uploading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <>
                  <Feather name="camera" size={14} color={colors.primary} />
                  <Text style={styles.addPhotoText}>Add Photos</Text>
                </>
              )}
            </Pressable>
          )}
          {imageList.length > 0 && (
            <View style={styles.imageCountRow}>
              <Text
                style={[
                  styles.imageCount,
                  imageList.length >= 500 && styles.imageCountHigh,
                ]}
              >
                {imageList.length}
              </Text>
              {imageList.length >= 500 && (
                <Feather
                  name="alert-triangle"
                  size={11}
                  color={colors.warning}
                />
              )}
            </View>
          )}
          {canPrivileged && imageList.length > 0 && (
            <Pressable
              onPress={() => setSelectMode(true)}
              style={styles.selectBtn}
            >
              <Feather
                name="check-square"
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
          <Pressable onPress={() => refetch()} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryFaint,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  retryText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  caseNumber: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
    marginBottom: 8,
  },
  vehicle: {
    fontSize: 25,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
  },
  model: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginTop: 3,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  updateBtn: {
    borderRadius: 8,
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  updateText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  eventRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
  },
  eventDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  eventBody: { flex: 1 },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  eventCreator: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
    flexShrink: 1,
  },
  eventType: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  eventFromTo: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
    marginTop: 2,
  },
  eventMsg: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 3,
  },
  eventTime: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    marginTop: 4,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  currentStatus: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
    marginBottom: 14,
  },
  waGroupMeta: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusOptionText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  statusOptionTextActive: {
    color: colors.primaryForeground,
  },
  noteInput: {
    minHeight: 82,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    textAlignVertical: "top",
    marginTop: 14,
  },
  saveBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  disabled: { opacity: 0.55 },
  saveText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primaryForeground,
  },
  sheetCancel: {
    alignItems: "center",
    paddingTop: 14,
  },
  sheetCancelText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },

  shareInternalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareInternalText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  editDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  editDetailsText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  tabRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 14,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imagesLoading: {
    paddingVertical: 24,
  },
  emptyImages: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  emptyImagesText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textMuted,
  },
  emptyImagesSub: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    textAlign: "center",
  },
  imageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelSelectText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
  selectedCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  bulkBtns: {
    flexDirection: "row",
    gap: 8,
  },
  bulkBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  bulkBtnDanger: {
    backgroundColor: colors.destructive + "12",
    borderColor: colors.destructive + "30",
  },
  selectBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addPhotoText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  imageCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
  },
  imageCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
  },
  imageCountHigh: {
    color: colors.warning,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primaryForeground,
  },
  editFormScroll: {
    maxHeight: 420,
  },
  editField: {
    marginBottom: 14,
  },
  editFieldLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
    marginBottom: 7,
  },
  editRequired: {
    color: colors.destructive,
  },
  editFieldInput: {
    minHeight: 50,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  editFieldTextarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  editChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  editChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  editChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
  },
  editChipTextActive: {
    color: colors.primaryForeground,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  editErrorText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.destructive,
    marginBottom: 12,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "space-between",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  viewerHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCounter: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5,
  },
  viewerImageArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerNavBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerNavLeft: {
    left: 12,
  },
  viewerNavRight: {
    right: 12,
  },
  viewerFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
    backgroundColor: "rgba(0,0,0,0.6)",
    gap: 4,
  },
  viewerPrimaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryImageBadge,
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 4,
  },
  viewerPrimaryText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
    textTransform: "uppercase",
  },
  viewerFilename: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  viewerMeta: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "rgba(255,255,255,0.55)",
  },

  waLoading: {
    paddingVertical: 20,
  },
  waSuccessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  waSuccessText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.success,
  },
  waInviteRow: {
    marginBottom: 14,
  },
  waInviteLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  waInviteLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  waInviteLink: {
    flex: 1,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
  },
  waCopyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  waSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  waSendText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  waFailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  waFailText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
  waManualText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.warning,
  },
  waManualDesc: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  waOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#25D366" + "60",
    backgroundColor: "#25D366" + "10",
    marginTop: 10,
    marginBottom: 8,
  },
  waOpenBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#25D366",
  },
  waRetryBtn: {
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructive + "10",
  },
  waRetryText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
  waCreatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  waCreatingText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
  },
  waNoGroupText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    marginBottom: 14,
  },
  waCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  waCreateText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  deleteCaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.destructive + "50",
    backgroundColor: colors.destructive + "10",
  },
  deleteCaseBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
  transferCaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + "50",
    backgroundColor: colors.primaryFaint,
    marginBottom: 10,
  },
  transferCaseBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  transferSubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textSecondary,
    marginBottom: 14,
  },
  advisorPickerList: {
    maxHeight: 220,
    marginBottom: 6,
  },
  advisorPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  advisorPickerRowActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primary + "60",
  },
  advisorPickerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  advisorPickerAvatarActive: {
    backgroundColor: colors.primary,
  },
  advisorPickerAvatarText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  advisorPickerAvatarTextActive: {
    color: "#fff",
  },
  advisorPickerInfo: {
    flex: 1,
  },
  advisorPickerName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  advisorPickerRole: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textMuted,
    textTransform: "capitalize",
    marginTop: 2,
  },
  viewerVideoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  viewerVideoText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  viewerVideoHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  uploadBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.primary + "40",
  },
  uploadBannerFailed: {
    backgroundColor: colors.destructiveFaint,
    borderBottomColor: colors.destructive + "40",
  },
  uploadBannerDone: {
    backgroundColor: colors.successFaint,
    borderBottomColor: colors.success + "40",
  },
  uploadBannerText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.primary,
  },
  uploadBannerTextFail: {
    color: colors.destructive,
  },
});
