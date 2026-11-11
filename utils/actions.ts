/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isNonNullish } from "@utils/guards";
import { chooseFile, saveFile } from "@utils/web";
import { ProfilePreset } from "@vencord/discord-types";
import { showToast, UserProfileSettingsStore, UserProfileStore, UserStore } from "@webpack/common";

import { getCurrentProfile } from "./profile";
import { addPreset, ALL_CAPTURE_FIELDS, movePresetInArray, presets, PresetSection, type ProfilePresetEx, removePreset, replaceAllPresets, savePresetsData, updatePreset } from "./storage";

function isImageInput(value: unknown): value is string | { imageUri: string; } {
    if (typeof value === "string") return value.length > 0;
    return typeof value === "object" && isNonNullish(value) && "imageUri" in value && typeof (value as { imageUri: unknown; }).imageUri === "string";
}

function isProfileFrame(value: unknown): value is NonNullable<ProfilePresetEx["profileFrame"]> {
    return typeof value === "object" && value !== null && "skuId" in value && typeof value.skuId === "string";
}

function getFreshPendingAvatar(section: PresetSection, guildId?: string): string | null {
    const pending = (section === "server" && guildId
        ? UserProfileSettingsStore.getPendingChanges?.(guildId)
        : UserProfileSettingsStore.getPendingChanges?.()) ?? {};
    const pendingObj = pending as Record<string, unknown>;
    const selected = [pendingObj.pendingAvatar].find(isImageInput);
    if (!selected) return null;
    return typeof selected === "string" ? selected : selected.imageUri;
}

export async function savePreset(name: string, section: PresetSection, guildId?: string, options?: { isGuildProfile?: boolean; captureFields?: string[]; }) {
    const isGuildProfile = options?.isGuildProfile ?? section === "server";
    const captureSet = new Set(options?.captureFields ?? ALL_CAPTURE_FIELDS);
    const profile = await getCurrentProfile(guildId, { isGuildProfile });
    const freshPendingAvatar = getFreshPendingAvatar(isGuildProfile ? "server" : "main", guildId);
    const effectiveAvatar = freshPendingAvatar ?? profile.avatarDataUrl ?? null;
    const pending = (isGuildProfile && guildId
        ? UserProfileSettingsStore.getPendingChanges(guildId)
        : UserProfileSettingsStore.getPendingChanges()) ?? {};
    const { pendingProfileFrame } = pending as Record<string, unknown>;
    const currentUserId = UserStore.getCurrentUser().id;
    const currentProfileWithFrame = (isGuildProfile && guildId
        ? UserProfileStore.getGuildMemberProfile(currentUserId, guildId)
        : UserProfileStore.getUserProfile(currentUserId)) as { profileFrame?: ProfilePresetEx["profileFrame"]; } | null | undefined;
    const profileFrame = pendingProfileFrame === null
        ? null
        : (isProfileFrame(pendingProfileFrame) ? pendingProfileFrame : profile.profileFrame ?? currentProfileWithFrame?.profileFrame ?? null);

    const captured = Object.fromEntries(
        (Object.entries(profile) as Array<[keyof Omit<ProfilePresetEx, "name" | "timestamp">, Omit<ProfilePresetEx, "name" | "timestamp">[keyof Omit<ProfilePresetEx, "name" | "timestamp">]]>)
            .filter(([key]) => captureSet.has(key))
    ) as Omit<ProfilePresetEx, "name" | "timestamp">;

    const newPreset: ProfilePresetEx = {
        name,
        timestamp: Date.now(),
        ...captured,
        ...(captureSet.has("avatarDataUrl") ? { avatarDataUrl: effectiveAvatar } : {}),
        ...(captureSet.has("profileFrame") ? { profileFrame } : {})
    };
    addPreset(newPreset);
    await savePresetsData(section, guildId);
}

export async function updatePresetField<K extends keyof Omit<ProfilePreset, "name" | "timestamp">>(
    index: number,
    field: K,
    value: Omit<ProfilePreset, "name" | "timestamp">[K],
    section: PresetSection,
    guildId?: string
) {
    if (index < 0 || index >= presets.length) return;
    void guildId;

    const updatedPreset = {
        ...presets[index],
        [field]: value,
        timestamp: Date.now()
    };
    updatePreset(index, updatedPreset);
    await savePresetsData(section, guildId);
}

export async function deletePreset(index: number, section: PresetSection, guildId?: string) {
    if (index < 0 || index >= presets.length) return;

    removePreset(index);
    await savePresetsData(section, guildId);
}

export async function movePreset(fromIndex: number, toIndex: number, section: PresetSection, guildId?: string) {
    if (fromIndex < 0 || fromIndex >= presets.length || toIndex < 0 || toIndex >= presets.length) return;

    movePresetInArray(fromIndex, toIndex);
    await savePresetsData(section, guildId);
}

export async function renamePreset(index: number, newName: string, section: PresetSection, guildId?: string) {
    if (index < 0 || index >= presets.length || !newName.trim()) return;

    const updatedPreset = { ...presets[index], name: newName.trim() };
    updatePreset(index, updatedPreset);
    await savePresetsData(section, guildId);
}

export function exportPresets(section: PresetSection, guildId?: string) {
    saveFile(new File([JSON.stringify(presets, null, 2)], `profile-presets-${section}-${Date.now()}.json`, { type: "application/json" }));
}

export type ImportDecision = "override" | "merge" | "cancel";

export async function importPresets(
    forceUpdate: () => void,
    onImportPrompt: (existingCount: number) => Promise<ImportDecision>,
    section: PresetSection,
    guildId?: string
) {
    const file = await chooseFile("application/json");
    if (!file) return;
    try {
            const text = await file.text();
            const importedPresets: unknown = JSON.parse(text);

            if (!Array.isArray(importedPresets) || !importedPresets.every(preset => typeof preset === "object" && preset !== null && typeof preset.name === "string" && typeof preset.timestamp === "number")) {
                return;
            }

            if (presets.length > 0) {
                const decision = await onImportPrompt(presets.length);
                if (decision === "cancel") return;
                if (decision === "override") {
                    replaceAllPresets(importedPresets);
                } else {
                    const combined = [...presets, ...importedPresets];
                    replaceAllPresets(combined);
                }
            } else {
                replaceAllPresets(importedPresets);
            }

            await savePresetsData(section, guildId);
            forceUpdate();
        } catch {
            showToast({ text: "Failed to import presets. The file might be invalid.", variant: "critical" });
        }
}
