import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { StatusBadge, statusLabel } from "@/components/cases/StatusBadge";
import { AddEventForm } from "@/components/cases/AddEventForm";
import { ImageThumbnail } from "@/components/cases/ImageThumbnail";
import colors from "@/constants/colors";
import {
  CustomerStatus,
  InternalStatus,
  deleteCase,
  fetchCase,
  updateCustomerStatus,
  updateInternalStatus,
} from "@/services/cases";
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
import { useCaseImages } from "@/hooks/useCaseImages";
import { useWhatsAppStatus } from "@/hooks/useWhatsAppStatus";
import {
  createWhatsAppGroup,
  sendWhatsAppMessage,
} from "@/services/whatsapp";
import * as Clipboard from "expo-clipboard";
import { formatCaseMessage } from "@/utils/messageFormatter";

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

const CUSTOMER_STATUSES: CustomerStatus[] = [
  "received",
  "in_repair",
  "final_inspection",
  "ready_for_delivery",
  "delivered",
];

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

export default function CaseDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ caseNumber: string }>();
  const caseNumber = Array.isArray(params.caseNumber) ? params.caseNumber[0] : params.caseNumber;
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "superadmin" || role === "admin";
  const isPrivileged = isAdmin || role === "advisor";
  const canUpdate = isPrivileged;
  const queryClient = useQueryClient();

  const [internalOpen, setInternalOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedInternal, setSelectedInternal] = useState<InternalStatus>("intake");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerStatus>("received");
  const [note, setNote] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [imageFolder, setImageFolder] = useState<"intake" | "repairs">("intake");
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const canEditCase = isPrivileged;
  const canUseWhatsApp = isPrivileged;
  const [waInitiated, setWaInitiated] = useState(false);
  const [waInitialMsg, setWaInitialMsg] = useState("");
  const [waCreateOpen, setWaCreateOpen] = useState(false);
  const [waSendOpen, setWaSendOpen] = useState(false);
  const [waSendMsg, setWaSendMsg] = useState("");

  const waStatusQuery = useWhatsAppStatus(caseNumber, canUseWhatsApp);

  const caseQuery = useQuery({
    queryKey: ["case", caseNumber],
    queryFn: () => fetchCase(caseNumber),
    enabled: !!caseNumber,
  });

  const events = useMemo(
    () => [...(caseQuery.data?.events ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [caseQuery.data?.events]
  );

  const internalMutation = useMutation({
    mutationFn: () => updateInternalStatus(caseNumber, selectedInternal, note.trim() || undefined),
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
    editMutation.mutate(editForm);
  };

  const createGroupMutation = useMutation({
    mutationFn: ({
      phone,
      msg,
    }: {
      phone: string;
      msg?: string;
    }) => createWhatsAppGroup(caseNumber, phone, msg),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWaInitiated(true);
      setWaCreateOpen(false);
      waStatusQuery.refetch();
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to create group."
      );
    },
  });

  const sendMsgMutation = useMutation({
    mutationFn: (message: string) =>
      sendWhatsAppMessage(caseNumber, message),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWaSendOpen(false);
      setWaSendMsg("");
      Alert.alert(
        "Message queued",
        "Your update will be sent to the WhatsApp group."
      );
    },
    onError: (err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to send message."
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCase(caseNumber),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      router.replace("/(cases)");
    },
    onError: (err) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete case.");
    },
  });

  const handleDeleteCase = () => {
    Alert.alert(
      "Delete Case",
      `Permanently delete case ${caseNumber}? All events, images, and data will be lost.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  const data = caseQuery.data;

  return (
    <View style={styles.root}>
      <AppHeader title={caseNumber ?? "Case"} subtitle={data?.vehicleNumber} showBack />
      {caseQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : caseQuery.isError || !data ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load case</Text>
          <Text style={styles.emptyText}>
            {caseQuery.error instanceof Error ? caseQuery.error.message : "Please try again."}
          </Text>
          <Pressable onPress={() => caseQuery.refetch()} style={styles.retryBtn}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.caseNumber}>{data.caseNumber}</Text>
            <Text style={styles.vehicle}>{data.vehicleNumber}</Text>
            <Text style={styles.model}>{data.carModel}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={data.internalStatus} type="internal" />
              <StatusBadge status={data.customerStatus} type="customer" />
            </View>
          </View>

          <View style={styles.card}>
            <Info label="KM Count" value={data.kmCount} />
            <Info label="Due Date" value={data.dueDate} />
            <Info label="Delivery Type" value={data.deliveryType} />
            <Info label="Customer Phone" value={data.customerPhone} />
            <Info label="Advisor" value={`${data.advisor.name} (${data.advisor.phone})`} />
            <Info label="Created" value={formatDate(data.createdAt)} />
            {data.notes ? <Info label="Notes" value={data.notes} /> : null}
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

          <StatusSection
            title="Internal Status"
            status={<StatusBadge status={data.internalStatus} type="internal" />}
            canUpdate={canUpdate}
            onUpdate={() => {
              setSelectedInternal(data.internalStatus);
              setInternalOpen(true);
            }}
          />

          <StatusSection
            title="Customer Status"
            status={<StatusBadge status={data.customerStatus} type="customer" />}
            canUpdate={canUpdate}
            onUpdate={() => {
              setSelectedCustomer(data.customerStatus);
              setCustomerOpen(true);
            }}
          />

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            {events.length === 0 ? (
              <Text style={styles.emptyText}>No events yet.</Text>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <View style={styles.eventDot} />
                  <View style={styles.eventBody}>
                    <Text style={styles.eventType}>{statusLabel(event.eventType)}</Text>
                    {event.message ? <Text style={styles.eventMsg}>{event.message}</Text> : null}
                    <Text style={styles.eventTime}>{formatDate(event.createdAt)}</Text>
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
                onImageView={(url) => setViewerImage(url)}
              />
            ) : (
              <ImagesGrid
                caseNumber={caseNumber}
                folder="repairs"
                role={role}
                onImageView={(url) => setViewerImage(url)}
              />
            )}
          </View>

          {isAdmin && (
            <Pressable
              onPress={handleDeleteCase}
              disabled={deleteMutation.isPending}
              style={[styles.deleteCaseBtn, deleteMutation.isPending && styles.disabled]}
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color={colors.destructive} size="small" />
              ) : (
                <>
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                  <Text style={styles.deleteCaseBtnText}>Delete Case</Text>
                </>
              )}
            </Pressable>
          )}

          {canUseWhatsApp && data && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>WhatsApp Group</Text>
              {waStatusQuery.isLoading && !waStatusQuery.data ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={styles.waLoading}
                />
              ) : waStatusQuery.data?.whatsappStatus === "created" ? (
                <View>
                  <View style={styles.waSuccessRow}>
                    <Feather
                      name="check-circle"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={styles.waSuccessText}>Group Created</Text>
                  </View>
                  {waStatusQuery.data.whatsappInviteLink ? (
                    <View style={styles.waInviteRow}>
                      <Text style={styles.waInviteLabel}>Invite Link</Text>
                      <View style={styles.waInviteLinkRow}>
                        <Text
                          style={styles.waInviteLink}
                          numberOfLines={1}
                        >
                          {waStatusQuery.data.whatsappInviteLink}
                        </Text>
                        <Pressable
                          onPress={() => {
                            Clipboard.setStringAsync(
                              waStatusQuery.data!.whatsappInviteLink!
                            );
                            Alert.alert("Copied");
                          }}
                          style={styles.waCopyBtn}
                        >
                          <Feather
                            name="copy"
                            size={14}
                            color={colors.primary}
                          />
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
                    <Feather
                      name="alert-circle"
                      size={16}
                      color={colors.destructive}
                    />
                    <Text style={styles.waFailText}>
                      Group creation failed
                    </Text>
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
                <View style={styles.waFailRow}>
                  <Feather
                    name="help-circle"
                    size={16}
                    color="#B54708"
                  />
                  <Text style={styles.waManualText}>
                    Manual action required
                  </Text>
                </View>
              ) : waInitiated ||
                waStatusQuery.data?.whatsappStatus === "pending" ||
                waStatusQuery.data?.whatsappStatus === "retrying" ? (
                <View style={styles.waCreatingRow}>
                  <ActivityIndicator
                    color={colors.primary}
                    size="small"
                  />
                  <Text style={styles.waCreatingText}>
                    Creating group...
                  </Text>
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
                    <Text style={styles.waCreateText}>
                      Create WhatsApp Group
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <StatusPickerModal
        visible={internalOpen}
        title="Update Internal Status"
        statuses={INTERNAL_STATUSES}
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
                onChangeText={(v) =>
                  setEditForm({ ...editForm, carModel: v })
                }
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
                onChangeText={(v) =>
                  setEditForm({ ...editForm, kmCount: v })
                }
                keyboardType="numeric"
              />
              <EditField
                label="Due Date"
                value={editForm.dueDate ?? ""}
                onChangeText={(v) =>
                  setEditForm({ ...editForm, dueDate: v })
                }
              />
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
                onChangeText={(v) =>
                  setEditForm({ ...editForm, notes: v })
                }
                multiline
              />

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
                    !editForm.carModel?.trim()) && styles.disabled,
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

      <Modal
        visible={!!viewerImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerImage(null)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setViewerImage(null)}
        >
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerImage(null)}
            hitSlop={12}
          >
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {viewerImage && (
            <Image
              source={{ uri: viewerImage }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
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
              {data?.customerPhone ? ` (${data.customerPhone})` : ""} and
              you ({data?.advisor.phone ?? "your number"}).
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
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
          <Pressable onPress={onSave} disabled={loading} style={[styles.saveBtn, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Status</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  onImageView,
}: {
  caseNumber: string;
  folder: "intake" | "repairs";
  role: string | undefined;
  onImageView: (url: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: images, isLoading, refetch } = useCaseImages(caseNumber, folder);
  const [uploading, setUploading] = useState(false);
  const canDelete = role === "superadmin" || role === "admin" || role === "advisor";

  const pickImages = (): Promise<string[]> =>
    new Promise((resolve) => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Take Photo", "Choose from Gallery"],
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
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            } else {
              resolve([]);
            }
          }
        );
      } else {
        Alert.alert("Add Photo", "Choose source", [
          {
            text: "Take Photo",
            onPress: async () => {
              const { status } =
                await ImagePickerLib.requestCameraPermissionsAsync();
              if (status !== "granted") {
                resolve([]);
                return;
              }
              const r = await ImagePickerLib.launchCameraAsync({
                quality: 0.85,
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
              });
              resolve(r.canceled ? [] : r.assets.map((a) => a.uri));
            },
          },
          { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
        ]);
      }
    });

  const handleAdd = async () => {
    const uris = await pickImages();
    if (uris.length === 0) return;

    setUploading(true);
    const confirmed: ConfirmImageItem[] = [];
    let failedCount = 0;

    for (const uri of uris) {
      try {
        const filename = `${Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}.jpg`;
        const presigned = await presignImage(caseNumber, {
          filename,
          contentType: "image/jpeg",
          folder,
        });
        await uploadImageToS3(presigned.uploadUrl, uri, "image/jpeg");
        confirmed.push({
          key: presigned.key,
          filename,
          folder,
        });
      } catch {
        failedCount++;
      }
    }

    if (confirmed.length > 0) {
      try {
        await confirmImages(caseNumber, confirmed);
      } catch (e) {
        Alert.alert("Upload Error", e instanceof Error ? e.message : "Failed to save image records.");
        setUploading(false);
        return;
      }
    }

    queryClient.invalidateQueries({
      queryKey: ["images", caseNumber, folder],
    });
    queryClient.invalidateQueries({ queryKey: ["case", caseNumber] });
    setUploading(false);

    if (failedCount > 0) {
      Alert.alert(
        "Upload Complete",
        `${confirmed.length} uploaded, ${failedCount} failed`
      );
    }
  };

  const handleDelete = (image: CaseEventImage) => {
    Alert.alert("Delete Image", "Remove this image?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteImage(caseNumber, image.id);
            queryClient.invalidateQueries({
              queryKey: ["images", caseNumber, folder],
            });
          } catch (e) {
            Alert.alert(
              "Error",
              e instanceof Error ? e.message : "Failed to delete image."
            );
          }
        },
      },
    ]);
  };

  return (
    <View>
      {isLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.imagesLoading}
        />
      ) : (
        <View style={styles.imageGrid}>
          {(images ?? []).map((img) => (
            <ImageThumbnail
              key={img.id}
              image={img}
              onPress={() => onImageView(img.url)}
              onLongPress={
                canDelete ? () => handleDelete(img) : undefined
              }
            />
          ))}
        </View>
      )}

      <View style={styles.imageActions}>
        <Pressable
          onPress={handleAdd}
          disabled={uploading}
          style={[
            styles.addPhotoBtn,
            uploading && styles.disabled,
          ]}
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
        <Pressable onPress={() => refetch()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
    marginBottom: 8,
  },
  vehicle: {
    fontSize: 25,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
  },
  model: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
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
  eventType: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
  },
  eventMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 3,
  },
  eventTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginTop: 4,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    color: colors.text,
    marginBottom: 8,
  },
  waGroupMeta: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  statusOptionTextActive: {
    color: "#fff",
  },
  noteInput: {
    minHeight: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
    marginTop: 14,
  },
  saveBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  disabled: { opacity: 0.55 },
  saveText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  sheetCancel: {
    alignItems: "center",
    paddingTop: 14,
  },
  sheetCancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
  },

  editDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  editDetailsText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
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
  imageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editFormScroll: {
    maxHeight: 420,
  },
  editField: {
    marginBottom: 14,
  },
  editFieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  editRequired: {
    color: colors.destructive,
  },
  editFieldInput: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  editFieldTextarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  editErrorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.destructive,
    marginBottom: 12,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  viewerImage: {
    width: "100%",
    height: "80%",
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.success,
  },
  waInviteRow: {
    marginBottom: 14,
  },
  waInviteLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
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
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
  waManualText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: "#B54708",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
  },
  waNoGroupText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: colors.destructive,
  },
});
