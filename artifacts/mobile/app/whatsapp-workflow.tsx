import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { ADMIN_DISPLAY, ADMIN_NUMBER } from "@/constants/admin";
import colors from "@/constants/colors";
import { saveAdminContact, saveCustomerContact } from "@/services/contacts";
import { useAuthStore } from "@/store/useAuthStore";
import { useIntakeStore } from "@/store/useIntakeStore";
import { generateGroupName } from "@/utils/groupNameGenerator";
import { formatIntakeMessage } from "@/utils/messageFormatter";
import {
  getWhatsAppInstallUrl,
  openWhatsAppNative,
  openWhatsAppWithContact,
  shareToWhatsAppIntent,
  shareViaWhatsApp,
} from "@/utils/whatsapp";

// ── Screen ──────────────────────────────────────────────────────────────────

export default function WhatsappWorkflowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { formData, vehicleNumber, createdCaseNumber } = useIntakeStore();
  const authUser = useAuthStore((state) => state.user);
  const advisorPhone = authUser?.phone;
  const accessToken = useAuthStore((state) => state.accessToken);

  const [copiedGroup, setCopiedGroup] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  // Native deeplink group flow: 0=idle, 1=name copied+WA opened, 2=msg copied
  const [nativeStep, setNativeStep] = useState<0 | 1 | 2>(0);
  // Intent share group flow: 0=idle, 1=shared
  const [intentStep, setIntentStep] = useState<0 | 1>(0);
  // Server (Baileys) group creation
  const [serverGroup, setServerGroup] = useState<{ inviteLink: string; groupId: string; messageSent: boolean } | null>(null);
  const [serverGroupLoading, setServerGroupLoading] = useState(false);
  const [serverGroupError, setServerGroupError] = useState<string | null>(null);

  const groupName = generateGroupName(vehicleNumber, formData.carModel);
  const message = formatIntakeMessage(vehicleNumber, formData);

  // ── Clipboard helpers ───────────────────────────────────────────────────────

  const copyGroupName = async () => {
    await Clipboard.setStringAsync(groupName);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedGroup(true);
    setTimeout(() => setCopiedGroup(false), 2500);
  };

  const copyMessage = async () => {
    await Clipboard.setStringAsync(message);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
    return true;
  };

  // ── Save contact ────────────────────────────────────────────────────────────

  const handleSaveContact = async () => {
    const phone = formData.contactNumber;
    if (!phone) {
      Alert.alert("No contact", "Add a customer contact number in the Intake screen first.");
      return;
    }
    const result = await saveCustomerContact(
      vehicleNumber,
      phone,
      formData.carModel,
      groupName
    );
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setContactSaved(true);
      Alert.alert("Contact Saved", result.message, [{ text: "OK" }]);
    } else {
      Alert.alert("Could not save contact", result.message);
    }
  };

  // ── Open WhatsApp chat ──────────────────────────────────────────────────────

  const handleOpenWhatsApp = async () => {
    const phone = formData.contactNumber;
    if (!phone) {
      Alert.alert("No contact", "Add a customer contact number first.");
      return;
    }
    const ok = await openWhatsAppWithContact(phone, "");
    if (!ok) Alert.alert("WhatsApp not found", "Please install WhatsApp.");
  };

  const handleShareIntake = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await shareViaWhatsApp(message);
    if (!ok) {
      Alert.alert("WhatsApp not available", "Copy the message instead.", [
        { text: "Copy Message", onPress: copyMessage },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  // ── Shared: prepare contacts before group creation ──────────────────────────

  const prepareContacts = async () => {
    const phone = formData.contactNumber;
    if (phone) {
      await saveCustomerContact(vehicleNumber, phone, formData.carModel, groupName);
    }
    await saveAdminContact();
  };

  // ── Method 1: Native Deeplink group creation ────────────────────────────────

  const handleNativeStep1 = async () => {
    await prepareContacts();
    await Clipboard.setStringAsync(groupName);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setNativeStep(1);

    const ok = await openWhatsAppNative();
    if (!ok) {
      Alert.alert(
        "WhatsApp not installed",
        "Install WhatsApp to use this feature.",
        [
          { text: "Install", onPress: () => Linking.openURL(getWhatsAppInstallUrl()) },
          { text: "Cancel", style: "cancel" },
        ]
      );
      setNativeStep(0);
    }
  };

  const handleNativeStep2 = async () => {
    await Clipboard.setStringAsync(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNativeStep(2);
    Alert.alert(
      "Message Copied!",
      "Switch to WhatsApp and paste the message in the new group.",
      [{ text: "OK" }]
    );
  };

  const resetNativeFlow = () => setNativeStep(0);

  // ── Method 2: Intent Share group creation ───────────────────────────────────

  const handleIntentShare = async () => {
    await prepareContacts();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Payload: group name on first line so user can cut it as the group title
    const payload = `${groupName}\n\n${message}`;
    const ok = await shareToWhatsAppIntent(payload);

    if (!ok) {
      Alert.alert(
        "WhatsApp not installed",
        "Install WhatsApp to use this feature.",
        [
          { text: "Install", onPress: () => Linking.openURL(getWhatsAppInstallUrl()) },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
    setIntentStep(1);
  };

  const resetIntentFlow = () => setIntentStep(0);

  // ── Method 3: Server (Baileys) group creation ───────────────────────────────

  const handleServerCreateGroup = async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      Alert.alert("Config missing", "Set EXPO_PUBLIC_API_URL in artifacts/mobile/.env.local (see .env.example).");
      return;
    }
    if (!createdCaseNumber) {
      Alert.alert("No case yet", "Create the job card first (tap 'Create Job Card' in the OCR screen).");
      return;
    }
    if (!formData.contactNumber) {
      Alert.alert("No contact", "Add customer phone in Intake screen first.");
      return;
    }
    if (!advisorPhone) {
      Alert.alert(
        "Advisor phone missing",
        "Your signed-in profile does not have a mobile number.",
        [{ text: "OK" }]
      );
      return;
    }
    setServerGroupLoading(true);
    setServerGroupError(null);
    try {
      // Use the proper backend route so the group gets linked to the DB case.
      const res = await fetch(
        `${apiUrl.replace(/\/$/, "")}/cases/${encodeURIComponent(createdCaseNumber)}/whatsapp/create-group`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            advisorPhone,
            initialMessage: message,
          }),
        }
      );
      const data = await res.json() as { jobId?: string; whatsappStatus?: string; groupName?: string; error?: string };
      if (res.ok && data.jobId) {
        setServerGroup({ inviteLink: "", groupId: data.jobId, messageSent: false });
        Alert.alert(
          "Group creation queued",
          "WhatsApp group will be created automatically in a few seconds. You'll get a notification when it's ready.",
          [{ text: "OK" }]
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setServerGroupError(data.error ?? "Unknown server error");
      }
    } catch {
      setServerGroupError("Cannot reach server. Check EXPO_PUBLIC_API_URL and server is running.");
    } finally {
      setServerGroupLoading(false);
    }
  };

  const resetServerGroup = () => { setServerGroup(null); setServerGroupError(null); };

  return (
    <View style={styles.root}>
      <AppHeader title="WhatsApp Workflow" subtitle={vehicleNumber} showBack />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Group name ─────────────────────────────────────── */}
        <View style={styles.card}>
          <SectionLabel dot={colors.primary} label="Generated Group Name" />
          <TouchableOpacity onPress={copyGroupName} style={styles.groupNameBox} activeOpacity={0.8}>
            <Text style={styles.groupName} numberOfLines={2}>{groupName}</Text>
            <Feather
              name={copiedGroup ? "check" : "copy"}
              size={16}
              color={copiedGroup ? colors.success : colors.primary}
            />
          </TouchableOpacity>
          <Text style={styles.hint}>Use this as the WhatsApp group name for this job</Text>
          <CopyActionRow copied={copiedGroup} onPress={copyGroupName} />
        </View>

        {/* ── Customer actions ────────────────────────────────── */}
        <View style={styles.card}>
          <SectionLabel dot={colors.whatsapp} label="Customer Actions" />

          <ListItem
            icon="user-plus"
            iconBg={contactSaved ? colors.success : colors.surfaceElevated}
            iconColor={contactSaved ? "#fff" : colors.textSecondary}
            title={contactSaved ? "Saved to Contacts" : "Save to Contacts"}
            sub={formData.contactNumber || "No number set"}
            chevron="chevron-right"
            onPress={handleSaveContact}
            accent={contactSaved ? colors.success : undefined}
          />

          <ListItem
            icon="message-circle"
            iconBg={colors.surfaceElevated}
            iconColor={colors.textSecondary}
            title="Open WhatsApp Chat"
            sub={formData.contactNumber || "No contact set"}
            chevron="external-link"
            onPress={handleOpenWhatsApp}
          />

          <ListItem
            icon="send"
            iconBg={colors.whatsapp}
            iconColor="#fff"
            title="Share Intake Update"
            sub="Send formatted vehicle received message"
            chevron="chevron-right"
            onPress={handleShareIntake}
            accent={colors.whatsapp}
          />
        </View>

        {/* ── Dual group creation card ────────────────────────── */}
        <DualGroupCreationCard
          groupName={groupName}
          customerPhone={formData.contactNumber}
          adminDisplay={ADMIN_DISPLAY}
          adminNumber={ADMIN_NUMBER}
          nativeStep={nativeStep}
          intentStep={intentStep}
          serverGroup={serverGroup}
          serverGroupLoading={serverGroupLoading}
          serverGroupError={serverGroupError}
          onNativeStep1={handleNativeStep1}
          onNativeStep2={handleNativeStep2}
          onNativeReset={resetNativeFlow}
          onIntentShare={handleIntentShare}
          onIntentReset={resetIntentFlow}
          onServerCreate={handleServerCreateGroup}
          onServerReset={resetServerGroup}
        />

        {/* ── Message preview ─────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.msgHeaderRow}>
            <SectionLabel dot={colors.textMuted} label="Message Preview" />
            <TouchableOpacity onPress={copyMessage} style={styles.copyMsgBtn} activeOpacity={0.7}>
              <Feather name={copiedMsg ? "check" : "copy"} size={13}
                color={copiedMsg ? colors.success : colors.textSecondary} />
              <Text style={[styles.copyMsgText, copiedMsg && { color: colors.success }]}>
                {copiedMsg ? "Copied" : "Copy"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.msgBox}>
            <Text style={styles.msgText}>{message}</Text>
          </View>
        </View>

        {/* ── Next step ───────────────────────────────────────── */}
        <TouchableOpacity onPress={() => router.push("/image-sharing")} style={styles.nextCard} activeOpacity={0.85}>
          <View style={styles.nextLeft}>
            <View style={styles.nextIcon}>
              <Feather name="image" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.nextTitle}>Share Vehicle Images</Text>
              <Text style={styles.nextSub}>Select and share photos to WhatsApp</Text>
            </View>
          </View>
          <Feather name="arrow-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Dual group creation card ───────────────────────────────────────────────────

interface DualGroupCardProps {
  groupName: string;
  customerPhone: string;
  adminDisplay: string;
  adminNumber: string;
  nativeStep: 0 | 1 | 2;
  intentStep: 0 | 1;
  serverGroup: { inviteLink: string; groupId: string; messageSent: boolean } | null;
  serverGroupLoading: boolean;
  serverGroupError: string | null;
  onNativeStep1: () => void;
  onNativeStep2: () => void;
  onNativeReset: () => void;
  onIntentShare: () => void;
  onIntentReset: () => void;
  onServerCreate: () => void;
  onServerReset: () => void;
}

function DualGroupCreationCard({
  groupName,
  customerPhone,
  adminDisplay,
  adminNumber,
  nativeStep,
  intentStep,
  serverGroup,
  serverGroupLoading,
  serverGroupError,
  onNativeStep1,
  onNativeStep2,
  onNativeReset,
  onIntentShare,
  onIntentReset,
  onServerCreate,
  onServerReset,
}: DualGroupCardProps) {
  return (
    <View style={gcStyles.card}>
      <SectionLabel dot={colors.primary} label="Create WhatsApp Group" />

      {/* Participants */}
      <View style={gcStyles.numbersRow}>
        <NumberPill label="Customer" number={customerPhone || "Not set"} />
        <View style={gcStyles.plusWrap}>
          <Text style={gcStyles.plus}>+</Text>
        </View>
        <NumberPill label="Admin (fixed)" number={adminDisplay} highlight />
      </View>

      {/* ── Method 1: Native Deeplink ────────────────────────── */}
      <MethodDivider
        label="Method 1 — Native Deeplink"
        active={nativeStep > 0}
        onReset={nativeStep > 0 ? onNativeReset : undefined}
      />

      <NativeDeeplinkFlow
        groupName={groupName}
        customerPhone={customerPhone}
        adminNumber={adminNumber}
        step={nativeStep}
        onStep1={onNativeStep1}
        onStep2={onNativeStep2}
      />

      {/* ── Method 2: Intent Share ───────────────────────────── */}
      <MethodDivider
        label="Method 2 — Intent Share"
        active={intentStep > 0}
        onReset={intentStep > 0 ? onIntentReset : undefined}
      />

      <IntentShareFlow
        step={intentStep}
        onShare={onIntentShare}
        customerPhone={customerPhone}
        adminNumber={adminNumber}
      />

      {/* ── Method 3: Server (Baileys) ───────────────────────── */}
      <MethodDivider
        label="Method 3 — Auto-Create via Server"
        active={!!serverGroup}
        onReset={serverGroup ? onServerReset : undefined}
      />

      <ServerGroupFlow
        group={serverGroup}
        loading={serverGroupLoading}
        error={serverGroupError}
        onCreate={onServerCreate}
      />
    </View>
  );
}

function MethodDivider({
  label,
  active,
  onReset,
}: {
  label: string;
  active: boolean;
  onReset?: () => void;
}) {
  return (
    <View style={mdStyles.row}>
      <View style={[mdStyles.line, active && { backgroundColor: colors.primary + "60" }]} />
      <Text style={[mdStyles.label, active && { color: colors.primary }]}>{label}</Text>
      <View style={[mdStyles.line, active && { backgroundColor: colors.primary + "60" }]} />
      {onReset && (
        <TouchableOpacity onPress={onReset} hitSlop={8} style={mdStyles.resetBtn}>
          <Text style={mdStyles.resetText}>Reset</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const mdStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  label: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: colors.textMuted,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  resetBtn: { marginLeft: 4 },
  resetText: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: colors.textMuted },
});

// ── Method 1 flow ─────────────────────────────────────────────────────────────

function NativeDeeplinkFlow({
  groupName,
  customerPhone,
  adminNumber,
  step,
  onStep1,
  onStep2,
}: {
  groupName: string;
  customerPhone: string;
  adminNumber: string;
  step: 0 | 1 | 2;
  onStep1: () => void;
  onStep2: () => void;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step === 0 ? 0 : step === 1 ? 0.5 : 1,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View>
      {/* Progress */}
      <View style={gcStyles.progressTrack}>
        <Animated.View style={[gcStyles.progressFill, { width: progressWidth }]} />
      </View>

      <StepButton
        stepNum={1}
        title="Copy Group Name & Open WhatsApp"
        subtitle={
          step === 0
            ? `Copies "${groupName}" → opens WhatsApp home`
            : `Done — group name copied, contacts pre-saved`
        }
        done={step >= 1}
        active={step === 0}
        onPress={onStep1}
        icon="users"
        color={colors.whatsapp}
      />

      {step >= 1 && (
        <View style={gcStyles.inlineGuide}>
          <Text style={gcStyles.guideTitle}>In WhatsApp:</Text>
          <Text style={gcStyles.guideStep}>1. Tap the new group icon (top-right)</Text>
          <Text style={gcStyles.guideStep}>2. Search & add: {customerPhone || "customer"}</Text>
          <Text style={gcStyles.guideStep}>3. Search & add: {adminNumber}</Text>
          <Text style={gcStyles.guideStep}>4. Tap Next → paste the group name → Create</Text>
        </View>
      )}

      <StepButton
        stepNum={2}
        title="Copy Intake Message"
        subtitle={
          step < 1
            ? "Complete step 1 first"
            : step === 1
            ? "Tap to copy the intake message for the group"
            : "Done — message copied, paste it in the group"
        }
        done={step >= 2}
        active={step === 1}
        disabled={step < 1}
        onPress={onStep2}
        icon="clipboard"
        color={colors.primary}
      />

      {step >= 2 && (
        <View style={gcStyles.successBanner}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={gcStyles.successText}>
            Group name & message copied. Paste the message in the new group!
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Method 2 flow ─────────────────────────────────────────────────────────────

function IntentShareFlow({
  step,
  onShare,
  customerPhone,
  adminNumber,
}: {
  step: 0 | 1;
  onShare: () => void;
  customerPhone: string;
  adminNumber: string;
}) {
  return (
    <View>
      <StepButton
        stepNum={1}
        title="Share Intake to WhatsApp Group"
        subtitle={
          step === 0
            ? "Opens WhatsApp share sheet — tap 'New Group' inside"
            : "Done — WhatsApp share sheet opened"
        }
        done={step >= 1}
        active={step === 0}
        onPress={onShare}
        icon="share-2"
        color={colors.whatsapp}
      />

      {step >= 1 && (
        <View style={gcStyles.inlineGuide}>
          <Text style={gcStyles.guideTitle}>Inside WhatsApp share sheet:</Text>
          <Text style={gcStyles.guideStep}>1. Tap "New Group"</Text>
          <Text style={gcStyles.guideStep}>2. Add: {customerPhone || "customer"}</Text>
          <Text style={gcStyles.guideStep}>3. Add: {adminNumber}</Text>
          <Text style={gcStyles.guideStep}>4. The intake text is pre-filled — send it</Text>
          <Text style={gcStyles.guideStep}>5. Cut the first line and paste as group name</Text>
        </View>
      )}

      {step >= 1 && (
        <View style={gcStyles.successBanner}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={gcStyles.successText}>
            WhatsApp opened with intake payload pre-filled. Create group, then paste the first line as group title.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Method 3: Server flow ─────────────────────────────────────────────────────

function ServerGroupFlow({
  group,
  loading,
  error,
  onCreate,
}: {
  group: { inviteLink: string; groupId: string; messageSent: boolean } | null;
  loading: boolean;
  error: string | null;
  onCreate: () => void;
}) {
  if (group) {
    return (
      <View>
        <View style={gcStyles.successBanner}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={gcStyles.successText}>
              Group created!{group.messageSent ? " Intake message auto-sent." : ""} Tap link to join or share.
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(group.inviteLink)}
              style={sgStyles.linkBtn}
              activeOpacity={0.8}
            >
              <Feather name="external-link" size={13} color={colors.whatsapp} />
              <Text style={sgStyles.linkText} numberOfLines={1}>{group.inviteLink}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity
        onPress={onCreate}
        disabled={loading}
        style={[sgStyles.createBtn, loading && { opacity: 0.6 }]}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="zap" size={16} color="#fff" />
        )}
        <Text style={sgStyles.createBtnText}>
          {loading ? "Creating group…" : "Auto-Create Group"}
        </Text>
      </TouchableOpacity>
      {error && (
        <View style={sgStyles.errorBox}>
          <Feather name="alert-circle" size={13} color={colors.destructive} />
          <Text style={sgStyles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const sgStyles = StyleSheet.create({
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.whatsapp,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 8,
  },
  createBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: "#fff",
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  linkText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.whatsapp,
    flex: 1,
    textDecorationLine: "underline",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.destructive + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.destructive + "40",
    padding: 10,
    marginBottom: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.destructive,
    lineHeight: 16,
  },
});

// ── StepButton ────────────────────────────────────────────────────────────────

function StepButton({
  stepNum,
  title,
  subtitle,
  done,
  active,
  disabled = false,
  onPress,
  icon,
  color,
}: {
  stepNum: number;
  title: string;
  subtitle: string;
  done: boolean;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        sbStyles.btn,
        active && { borderColor: color, backgroundColor: color + "15" },
        done && sbStyles.btnDone,
        disabled && sbStyles.btnDisabled,
      ]}
      activeOpacity={0.8}
    >
      <View style={[sbStyles.numBadge, done && { backgroundColor: colors.success }, active && { backgroundColor: color }]}>
        {done ? (
          <Feather name="check" size={12} color="#fff" />
        ) : (
          <Text style={sbStyles.numText}>{stepNum}</Text>
        )}
      </View>
      <View style={sbStyles.textWrap}>
        <Text style={[sbStyles.title, disabled && sbStyles.titleDisabled, done && { color: colors.success }]}>
          {title}
        </Text>
        <Text style={sbStyles.subtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      {!done && !disabled && (
        <View style={[sbStyles.arrowWrap, { backgroundColor: color + "20" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
      )}
      {done && (
        <Feather name="check-circle" size={18} color={colors.success} />
      )}
    </TouchableOpacity>
  );
}

const sbStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  btnDone: {
    borderColor: colors.success + "50",
    backgroundColor: colors.success + "10",
  },
  btnDisabled: { opacity: 0.4 },
  numBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  numText: { fontSize: 12, fontFamily: "PlusJakartaSans_700Bold", color: "#fff" },
  textWrap: { flex: 1 },
  title: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: 2,
  },
  titleDisabled: { color: colors.textMuted },
  subtitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    lineHeight: 16,
  },
  arrowWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

const gcStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  numbersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  plusWrap: { width: 16, alignItems: "center" },
  plus: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold", color: colors.textMuted },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  inlineGuide: {
    backgroundColor: colors.whatsapp + "12",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.whatsapp + "30",
    padding: 12,
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: colors.whatsapp,
    marginBottom: 6,
  },
  guideStep: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.textSecondary,
    lineHeight: 19,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.success + "15",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.success + "40",
    padding: 12,
  },
  successText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: colors.success,
    lineHeight: 17,
  },
});

// ── Reusable sub-components ────────────────────────────────────────────────────

function SectionLabel({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={slStyles.row}>
      <View style={[slStyles.dot, { backgroundColor: dot }]} />
      <Text style={slStyles.label}>{label}</Text>
    </View>
  );
}
const slStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  dot: { width: 4, height: 18, borderRadius: 2 },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    fontWeight: "500" as const,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

function CopyActionRow({ copied, onPress }: { copied: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[carStyles.row, copied && carStyles.rowOk]}
      activeOpacity={0.8}
    >
      <Feather name={copied ? "check-circle" : "copy"} size={18}
        color={copied ? colors.success : colors.primary} />
      <Text style={[carStyles.text, copied && { color: colors.success }]}>
        {copied ? "Copied!" : "Copy Group Name"}
      </Text>
    </TouchableOpacity>
  );
}
const carStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryFaint,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  rowOk: { backgroundColor: colors.success + "15", borderColor: colors.success + "40" },
  text: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontWeight: "600" as const,
    color: colors.primary,
  },
});

function ListItem({
  icon, iconBg, iconColor, title, sub, chevron, onPress, accent,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  chevron: keyof typeof Feather.glyphMap;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={liStyles.row} activeOpacity={0.8}>
      <View style={[liStyles.icon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <View style={liStyles.text}>
        <Text style={[liStyles.title, accent ? { color: accent } : null]}>{title}</Text>
        <Text style={liStyles.sub} numberOfLines={1}>{sub}</Text>
      </View>
      <Feather name={chevron} size={16} color={accent ?? colors.textSecondary} />
    </TouchableOpacity>
  );
}
const liStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  title: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.text },
  sub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, marginTop: 2 },
});

function NumberPill({ label, number, highlight }: { label: string; number: string; highlight?: boolean }) {
  return (
    <View style={[npStyles.pill, highlight && npStyles.hl]}>
      <Text style={npStyles.label}>{label}</Text>
      <Text style={[npStyles.number, highlight && npStyles.numberHl]} numberOfLines={1}>{number}</Text>
    </View>
  );
}
const npStyles = StyleSheet.create({
  pill: {
    flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: "center",
  },
  hl: { borderColor: colors.primary + "60", backgroundColor: colors.primaryFaint },
  label: {
    fontSize: 10, fontFamily: "PlusJakartaSans_500Medium", color: colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3,
  },
  number: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: colors.text, textAlign: "center" },
  numberHl: { color: colors.primary },
});

// ── Main styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  groupNameBox: {
    backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
    borderColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", marginBottom: 8,
  },
  groupName: {
    flex: 1, fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", fontWeight: "700" as const,
    color: colors.text, letterSpacing: 0.5,
  },
  hint: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: colors.textMuted, marginBottom: 14 },
  msgHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 0 },
  copyMsgBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceElevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: -4,
  },
  copyMsgText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: colors.textSecondary },
  msgBox: { backgroundColor: colors.inputBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, lineHeight: 20 },
  nextCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  nextLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  nextIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryFaint, alignItems: "center", justifyContent: "center" },
  nextTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", fontWeight: "600" as const, color: colors.text },
  nextSub: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: colors.textSecondary, marginTop: 2 },
});
