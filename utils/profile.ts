/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUserSettingLazy } from "@api/UserSettings";
import { AvatarDecorationData, CustomStatus, DisplayNameStyles, Nameplate, ProfileEffect } from "@vencord/discord-types";
import { FluxDispatcher, GuildMemberStore, IconUtils, UserProfileSettingsStore, UserProfileStore, UserStore } from "@webpack/common";

import { type ProfilePresetEx } from "./storage";

const CustomStatusSettings = getUserSettingLazy("status", "customStatus");

type PendingChanges = Record<string, unknown> & {
    pendingAvatar?: ImageInput;
    pendingBanner?: ImageInput;
    pendingAvatarDecoration?: AvatarDecorationLike | null;
    pendingProfileEffect?: ProfileEffect | null;
    pendingNameplate?: Nameplate | null;
    pendingProfileFrame?: { skuId?: string; type?: number; } | null;
    pendingDisplayNameStyles?: DisplayNameStyles | null;
    pendingAccentColor?: number | null;
    pendingThemeColors?: number[] | null;
    pendingBio?: string | null;
    pendingPronouns?: string | null;
    pendingCustomStatus?: CustomStatus | null;
    pendingNickname?: string | null;
    pendingGlobalName?: string | null;
    pendingPrimaryGuildId?: string | null;
};

type ImageInput = string | { imageUri: string;[key: string]: unknown; } | null | undefined;
type AvatarDecorationLike = AvatarDecorationData & {
    label?: string;
    type?: number;
};
type DisplayNameStylesLike = DisplayNameStyles & {
    fontId?: number;
    effectId?: number;
};

type CurrentProfileOptions = {
    isGuildProfile?: boolean;
};

type LoadPresetOptions = {
    skipGlobalName?: boolean;
    skipBio?: boolean;
    skipPronouns?: boolean;
    isGuildProfile?: boolean;
};

function dispatch(type: string, payload: Record<string, unknown>) {
    FluxDispatcher.dispatch({ type, ...payload });
}

let pendingCollector: PendingChanges | null = null;

function setPendingChanges(payload: Record<string, unknown>, guildId?: string) {
    if (pendingCollector) {
        Object.assign(pendingCollector, payload);
        return;
    }
    dispatch("USER_PROFILE_SETTINGS_SET_PENDING_CHANGES", guildId ? { guildId, ...payload } : payload);
}

let previewChanges: PendingChanges | null = null;
let originalGetPendingChanges: ((guildId?: string) => Record<string, unknown>) | null = null;

export function isPreviewing() {
    return previewChanges !== null;
}

export function startPreview(changes: PendingChanges) {
    previewChanges = changes;
    if (originalGetPendingChanges) return;

    const original = UserProfileSettingsStore.getPendingChanges.bind(UserProfileSettingsStore);
    originalGetPendingChanges = original;
    UserProfileSettingsStore.getPendingChanges = (guildId?: string) => previewChanges ?? original(guildId);
}

export function stopPreview() {
    if (!previewChanges) return;

    previewChanges = null;
    if (originalGetPendingChanges) {
        UserProfileSettingsStore.getPendingChanges = originalGetPendingChanges;
        originalGetPendingChanges = null;
    }
}

export function previewProfile(profile: { _userProfile: Record<string, unknown>; bio?: string; pronouns?: string; } | null) {
    if (!previewChanges || !profile) return profile;

    const { pendingBio, pendingPronouns, pendingGlobalName, pendingNickname } = previewChanges;
    const name = pendingNickname ?? pendingGlobalName;
    if (pendingBio == null && pendingPronouns == null && name == null) return profile;

    const userProfile = { ...profile._userProfile };
    if (pendingBio != null) userProfile.bio = pendingBio;
    if (pendingPronouns != null) userProfile.pronouns = pendingPronouns;
    if (name != null) userProfile.globalName = name;

    const clone = Object.assign(Object.create(Object.getPrototypeOf(profile)), profile, { _userProfile: userProfile });
    if (pendingBio != null) clone.bio = pendingBio;
    if (pendingPronouns != null) clone.pronouns = pendingPronouns;
    return clone;
}

export function previewName(name: unknown) {
    const pending = previewChanges?.pendingNickname ?? previewChanges?.pendingGlobalName;
    return pending ?? name;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function hasImageInput(value: ImageInput): boolean {
    if (!value) return false;
    if (typeof value === "string") return value.length > 0;
    return typeof value === "object" && isNonEmptyString(value?.imageUri);
}

function hasAvatarDecoration(value: unknown): value is AvatarDecorationLike {
    return typeof value === "object"
        && value != null
        && "asset" in value
        && "skuId" in value
        && isNonEmptyString((value as { asset?: unknown; }).asset)
        && isNonEmptyString((value as { skuId?: unknown; }).skuId);
}

function normalizeDisplayNameStyles(value: DisplayNameStylesLike | null | undefined): DisplayNameStylesLike | null {
    if (!value) return null;
    const fontId = value.fontId ?? value.font_id;
    const effectId = value.effectId ?? value.effect_id;
    if (typeof fontId !== "number" || typeof effectId !== "number") return null;
    const colors = Array.isArray(value.colors) ? [...value.colors] : [];

    return {
        fontId,
        effectId,
        font_id: fontId,
        effect_id: effectId,
        colors
    };
}

export async function imageUrlToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function processImage(imageData: ImageInput, userId: string, type: "avatar" | "banner", guildId?: string, useGuildPath?: boolean): Promise<string | null> {
    if (!imageData) return null;

    if (typeof imageData === "object" && isNonEmptyString(imageData?.imageUri)) {
        if (imageData.imageUri.startsWith("data:")) return imageData.imageUri;
        return await imageUrlToBase64(imageData.imageUri);
    }

    if (typeof imageData === "string") {
        if (imageData.startsWith("data:")) return imageData;
        if (/^https?:\/\//.test(imageData)) {
            return await imageUrlToBase64(imageData);
        }

        const size = type === "banner" ? 1024 : 512;
        if (type === "banner") {
            const bannerUrl = useGuildPath && guildId
                ? IconUtils.getGuildMemberBannerURL({ id: userId, guildId, banner: imageData, canAnimate: true, size })
                : IconUtils.getUserBannerURL({ id: userId, banner: imageData, canAnimate: true, size });
            return bannerUrl ? await imageUrlToBase64(bannerUrl) : null;
        }

        const currentUser = UserStore.getCurrentUser();
        const url = IconUtils.getUserAvatarURL(currentUser, true, size, useGuildPath ? guildId : undefined);
        return await imageUrlToBase64(url);
    }

    return null;
}

export async function getCurrentProfile(guildId?: string, options: CurrentProfileOptions = {}): Promise<Omit<ProfilePresetEx, "name" | "timestamp">> {
    const currentUser = UserStore.getCurrentUser();
    const baseProfile = UserProfileStore.getUserProfile(currentUser.id);
    const isGuildProfile = options.isGuildProfile ?? Boolean(guildId);
    const effectiveGuildId = isGuildProfile ? guildId : undefined;
    const guildProfile = effectiveGuildId ? UserProfileStore.getGuildMemberProfile(currentUser.id, effectiveGuildId) : null;
    const userProfile = guildProfile ?? baseProfile;
    const userAny = currentUser;
    const guildMember = effectiveGuildId ? GuildMemberStore.getMember(effectiveGuildId, currentUser.id) : null;

    const pendingChangesDefault: PendingChanges = UserProfileSettingsStore.getPendingChanges() ?? {};
    const pendingChangesForGuild: PendingChanges = UserProfileSettingsStore.getPendingChanges(effectiveGuildId) ?? {};
    const pendingChanges: PendingChanges = isGuildProfile ? pendingChangesForGuild : pendingChangesDefault;
    const customStatusSetting = CustomStatusSettings?.getSetting();
    const customStatus = {
        text: customStatusSetting?.text ?? "",
        emojiId: customStatusSetting?.emojiId ?? "0",
        emojiName: customStatusSetting?.emojiName ?? "",
        expiresAtMs: customStatusSetting?.expiresAtMs ?? "0"
    };

    const avatarDecorationSource = "pendingAvatarDecoration" in pendingChanges
        ? (pendingChanges.pendingAvatarDecoration ?? null)
        : (isGuildProfile ? guildMember?.avatarDecoration : userAny.avatarDecorationData);
    const avatarDecoration = hasAvatarDecoration(avatarDecorationSource)
        ? {
            ...avatarDecorationSource,
            asset: avatarDecorationSource.asset,
            skuId: avatarDecorationSource.skuId
        }
        : null;

    let profileEffect: ProfileEffect | null = null;
    const effectToUse = "pendingProfileEffect" in pendingChanges
        ? (pendingChanges.pendingProfileEffect ?? null)
        : (isGuildProfile ? (guildProfile?.profileEffect ?? null) : (userProfile?.profileEffect ?? null));

    if (effectToUse) {
        if (effectToUse.skuId && effectToUse.effects) {
            profileEffect = {
                skuId: effectToUse.skuId,
                title: effectToUse.title,
                description: effectToUse.description,
                accessibilityLabel: effectToUse.accessibilityLabel,
                reducedMotionSrc: effectToUse.reducedMotionSrc,
                thumbnailPreviewSrc: effectToUse.thumbnailPreviewSrc,
                effects: effectToUse.effects,
                animationType: effectToUse.animationType,
                staticFrameSrc: effectToUse.staticFrameSrc,
                type: effectToUse.type || 1
            };
        } else if (effectToUse.skuId) {
            const collectibles = userProfile?.collectibles;
            const collectible = collectibles?.find(c => c?.skuId === effectToUse.skuId);
            if (collectible) {
                profileEffect = {
                    skuId: collectible.skuId,
                    title: collectible.title,
                    description: collectible.description,
                    accessibilityLabel: collectible.accessibilityLabel,
                    reducedMotionSrc: collectible.reducedMotionSrc,
                    thumbnailPreviewSrc: collectible.thumbnailPreviewSrc,
                    effects: collectible.effects,
                    animationType: collectible.animationType,
                    staticFrameSrc: collectible.staticFrameSrc,
                    type: collectible.type || 1
                };
            }
        }
    }

    const nameplateToUse = "pendingNameplate" in pendingChanges
        ? (pendingChanges.pendingNameplate ?? null)
        : (isGuildProfile ? guildMember?.collectibles?.nameplate : userAny.collectibles?.nameplate);
    const nameplate = nameplateToUse ? {
        skuId: nameplateToUse.skuId,
        asset: nameplateToUse.asset,
        label: nameplateToUse.label,
        palette: typeof nameplateToUse.palette === "string" ? nameplateToUse.palette : undefined,
        type: nameplateToUse.type || 2
    } : null;

    const profileFrameToUse = pendingChanges.pendingProfileFrame !== undefined
        ? pendingChanges.pendingProfileFrame
        : normalizeProfileFrame((isGuildProfile ? guildProfile : userProfile) as { profileFrame?: unknown; });
    const profileFrame = normalizeProfileFrame(profileFrameToUse);

    const savedDisplayNameStyles = isGuildProfile
        ? (guildMember?.displayNameStyles ?? userAny.displayNameStyles)
        : userAny.displayNameStyles;
    const displayNameStylesToUse = "pendingDisplayNameStyles" in pendingChanges
        ? pendingChanges.pendingDisplayNameStyles
        : savedDisplayNameStyles;
    const displayNameStyles = normalizeDisplayNameStyles(displayNameStylesToUse);

    const { pendingAvatar } = pendingChanges;
    const pendingAvatarRemoved = "pendingAvatar" in pendingChanges && !hasImageInput(pendingAvatar);
    const avatarToUse: ImageInput = hasImageInput(pendingAvatar)
        ? pendingAvatar
        : (pendingAvatarRemoved
            ? null
            : (isGuildProfile ? (guildMember?.avatar ?? currentUser.avatar ?? null) : (currentUser.avatar ?? null)));

    const useGuildAvatar = !!(effectiveGuildId && isGuildProfile && guildMember?.avatar && avatarToUse === guildMember.avatar);

    const avatarInput: ImageInput = hasImageInput(avatarToUse)
        ? avatarToUse
        : (isGuildProfile || pendingAvatarRemoved ? null : IconUtils.getUserAvatarURL(currentUser, true, 512));
    const avatarDataUrl = await processImage(avatarInput, currentUser.id, "avatar", effectiveGuildId, useGuildAvatar);
    const resolvedAvatarDataUrl = avatarDataUrl ?? (isGuildProfile || pendingAvatarRemoved ? null : IconUtils.getDefaultAvatarURL(currentUser.id));

    const hasPendingBanner = "pendingBanner" in pendingChanges || "pendingBanner" in pendingChangesDefault;
    const pendingBanner = "pendingBanner" in pendingChanges
        ? pendingChanges.pendingBanner
        : pendingChangesDefault.pendingBanner;
    const bannerToUse: ImageInput = hasPendingBanner
        ? pendingBanner
        : (isGuildProfile ? (guildProfile?.banner ?? baseProfile?.banner) : baseProfile?.banner);
    const useGuildBanner = !!(effectiveGuildId && isGuildProfile && guildProfile?.banner && bannerToUse === guildProfile?.banner);

    const bannerDataUrl = await processImage(bannerToUse, currentUser.id, "banner", effectiveGuildId, useGuildBanner);

    return {
        avatarDataUrl: resolvedAvatarDataUrl,
        bannerDataUrl,
        bio: pendingChanges.pendingBio ?? (isGuildProfile ? guildProfile?.bio : baseProfile?.bio) ?? null,
        accentColor: "pendingAccentColor" in pendingChanges
            ? (pendingChanges.pendingAccentColor ?? null)
            : ((isGuildProfile ? guildProfile?.accentColor : userProfile?.accentColor) ?? null),
        themeColors: "pendingThemeColors" in pendingChanges
            ? (pendingChanges.pendingThemeColors ?? null)
            : ((isGuildProfile ? guildProfile?.themeColors : userProfile?.themeColors) ?? null),
        globalName: isGuildProfile
            ? ("pendingNickname" in pendingChanges ? (pendingChanges.pendingNickname ?? null) : (guildMember?.nick ?? null))
            : ("pendingGlobalName" in pendingChanges ? (pendingChanges.pendingGlobalName ?? null) : (currentUser.globalName ?? null)),
        pronouns: pendingChanges.pendingPronouns ?? (isGuildProfile ? guildProfile?.pronouns : userProfile?.pronouns) ?? null,
        avatarDecoration,
        profileEffect,
        nameplate,
        profileFrame,
        primaryGuildId: "pendingPrimaryGuildId" in pendingChangesDefault
            ? (pendingChangesDefault.pendingPrimaryGuildId ?? null)
            : (userAny.primaryGuild?.identityGuildId ?? null),
        customStatus,
        displayNameStyles
    };
}

function customStatusEq(a: CustomStatus | null | undefined, b: CustomStatus | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return a.text === b.text
        && String(a.emojiId ?? "") === String(b.emojiId ?? "")
        && a.emojiName === b.emojiName
        && String(a.expiresAtMs ?? "0") === String(b.expiresAtMs ?? "0");
}

function profileValueEq(a: unknown, b: unknown): boolean {
    if ((a == null || a === "") && (b == null || b === "")) return true;
    if (typeof a === "object" && a !== null && "imageUri" in a) a = a.imageUri;
    if (typeof b === "object" && b !== null && "imageUri" in b) b = b.imageUri;
    return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function normalizeProfileFrame(frame: unknown): { skuId?: string; type?: number; } | null {
    if (!frame || typeof frame !== "object" || !("skuId" in frame)) return null;
    const { skuId, type } = frame as { skuId?: unknown; type?: unknown; };
    if (typeof skuId !== "string" && typeof skuId !== "number") return null;
    return { skuId: String(skuId), type: typeof type === "number" ? type : undefined };
}

let statusSnapshot: { value: CustomStatus | null | undefined; } | null = null;
let appliedPresetStatus: { value: CustomStatus | null | undefined; } | null = null;

export function revertPresetStatus() {
    const snap = statusSnapshot?.value;
    statusSnapshot = null;
    if (snap) {
        CustomStatusSettings?.updateSetting({
            text: snap.text ?? "",
            expiresAtMs: snap.expiresAtMs ?? "0",
            emojiId: snap.emojiId ?? "0",
            emojiName: snap.emojiName ?? "",
            createdAtMs: String(Date.now())
        });
    } else if (appliedPresetStatus && customStatusEq(appliedPresetStatus.value, CustomStatusSettings?.getSetting())) {
        CustomStatusSettings?.updateSetting({
            text: "",
            expiresAtMs: "0",
            emojiId: "0",
            emojiName: "",
            createdAtMs: String(Date.now())
        });
    }
    appliedPresetStatus = null;
}

export function clearStatusSnapshot() {
    statusSnapshot = null;
    appliedPresetStatus = null;
}

export async function loadPresetAsPending(preset: ProfilePresetEx, guildId?: string, options: LoadPresetOptions = {}) {
    if (!pendingCollector) stopPreview();
    const isGuild = options.isGuildProfile ?? Boolean(guildId);
    if (isGuild && !guildId) return;
    const current = await getCurrentProfile(guildId, { isGuildProfile: isGuild });
    const pending: Record<string, unknown> = {
        pendingBanner: preset.bannerDataUrl?.startsWith("data:")
            ? {
                assetOrigin: "NEW_ASSET",
                imageUri: preset.bannerDataUrl,
                description: `profilesets-${preset.name ?? "preset"}`
            }
            : preset.bannerDataUrl ?? null,
        pendingThemeColors: preset.themeColors ?? null,
        pendingAccentColor: preset.accentColor ?? null,
        pendingProfileFrame: preset.profileFrame ?? null
    };

    if ("avatarDataUrl" in preset) {
        pending.pendingAvatar = preset.avatarDataUrl?.startsWith("data:")
            ? {
                assetOrigin: "NEW_ASSET",
                imageUri: preset.avatarDataUrl,
                description: `profilesets-${preset.name ?? "preset"}`
            }
            : preset.avatarDataUrl || IconUtils.getDefaultAvatarURL(UserStore.getCurrentUser().id);
    } else {
        pending.pendingAvatar = IconUtils.getDefaultAvatarURL(UserStore.getCurrentUser().id);
    }
    if (!options.skipBio && (!isGuild || preset.bio != null)) pending.pendingBio = preset.bio ?? "";
    if (!options.skipPronouns && (!isGuild || preset.pronouns != null)) pending.pendingPronouns = preset.pronouns ?? "";
    if (!options.skipGlobalName && preset.globalName !== undefined) pending[isGuild ? "pendingNickname" : "pendingGlobalName"] = preset.globalName;
    if (preset.avatarDecoration !== undefined) pending.pendingAvatarDecoration = preset.avatarDecoration;
    if (preset.profileEffect !== undefined) pending.pendingProfileEffect = preset.profileEffect;
    if (preset.nameplate !== undefined) pending.pendingNameplate = preset.nameplate;
    if ("displayNameStyles" in preset) pending.pendingDisplayNameStyles = normalizeDisplayNameStyles(preset.displayNameStyles);
    if (!isGuild && "primaryGuildId" in preset) pending.pendingPrimaryGuildId = preset.primaryGuildId ?? null;
    if (isGuild && "customStatus" in preset) pending.pendingCustomStatus = preset.customStatus ?? null;
    const fields: Array<[keyof typeof pending, keyof typeof current]> = [
        ["pendingBio", "bio"], ["pendingPronouns", "pronouns"], ["pendingGlobalName", "globalName"],
        ["pendingNickname", "globalName"], ["pendingProfileEffect", "profileEffect"], ["pendingNameplate", "nameplate"],
        ["pendingDisplayNameStyles", "displayNameStyles"], ["pendingAccentColor", "accentColor"],
        ["pendingThemeColors", "themeColors"], ["pendingProfileFrame", "profileFrame"],
        ["pendingPrimaryGuildId", "primaryGuildId"]
    ];
    for (const [pendingKey, currentKey] of fields) {
        if (pendingKey in pending && profileValueEq(pending[pendingKey], current[currentKey])) delete pending[pendingKey];
    }
    if ("pendingAvatarDecoration" in pending && profileValueEq(pending.pendingAvatarDecoration, current.avatarDecoration)) delete pending.pendingAvatarDecoration;
    if ("pendingCustomStatus" in pending && customStatusEq(pending.pendingCustomStatus as CustomStatus, current.customStatus)) delete pending.pendingCustomStatus;
    if ("pendingAvatar" in pending && profileValueEq(pending.pendingAvatar, current.avatarDataUrl)) delete pending.pendingAvatar;
    if ("pendingBanner" in pending && profileValueEq(pending.pendingBanner, current.bannerDataUrl)) delete pending.pendingBanner;
    if (Object.keys(pending).length) setPendingChanges(pending, isGuild ? guildId : undefined);

    if (!pendingCollector && "customStatus" in preset) {
        appliedPresetStatus = { value: preset.customStatus ?? null };
        if (!customStatusEq(preset.customStatus, CustomStatusSettings?.getSetting())) {
            if (!statusSnapshot) statusSnapshot = { value: CustomStatusSettings?.getSetting() };
            CustomStatusSettings?.updateSetting({
                text: preset.customStatus?.text ?? "",
                expiresAtMs: preset.customStatus?.expiresAtMs ?? "0",
                emojiId: preset.customStatus?.emojiId ?? "0",
                emojiName: preset.customStatus?.emojiName ?? "",
                createdAtMs: String(Date.now())
            });
        }
    }
}

export async function buildPresetPreview(preset: ProfilePresetEx, guildId?: string, options: LoadPresetOptions = {}): Promise<PendingChanges> {
    const collector: PendingChanges = {};
    pendingCollector = collector;
    try {
        await loadPresetAsPending(preset, guildId, options);
        return collector;
    } finally {
        pendingCollector = null;
    }
}
