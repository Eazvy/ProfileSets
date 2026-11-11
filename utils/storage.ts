/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { ProfilePreset } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

const logger = new Logger("ProfilePresets");
const LEGACY_PRESETS_KEY = "ProfileDataset";
const MAIN_PRESETS_KEY = "ProfilePresets_v2_Main";
const SERVER_PRESETS_KEY = "ProfilePresets_v2_Server";

export type PresetSection = "main" | "server";

export type ProfilePresetEx = ProfilePreset & {
    avatarRaw?: string | null;
    profileFrame?: { skuId?: string; type?: number; } | null;
};

export const CAPTURE_FIELD_OPTIONS = [
    { value: "avatarDataUrl", label: "Avatar" },
    { value: "bannerDataUrl", label: "Banner" },
    { value: "bio", label: "Bio" },
    { value: "accentColor", label: "Accent Color" },
    { value: "themeColors", label: "Theme Colors" },
    { value: "globalName", label: "Name" },
    { value: "pronouns", label: "Pronouns" },
    { value: "avatarDecoration", label: "Avatar Decoration" },
    { value: "profileEffect", label: "Profile Effect" },
    { value: "nameplate", label: "Nameplate" },
    { value: "profileFrame", label: "Profile Frame" },
    { value: "primaryGuildId", label: "Primary Guild" },
    { value: "customStatus", label: "Custom Status" },
    { value: "displayNameStyles", label: "Name Style" }
] as const satisfies ReadonlyArray<{ value: string; label: string; }>;

export const ALL_CAPTURE_FIELDS = CAPTURE_FIELD_OPTIONS.map(option => option.value);

export const CARD_FIELD_OPTIONS = [
    { value: "bannerDataUrl", label: "Banner" },
    { value: "avatarDataUrl", label: "Avatar" },
    { value: "avatarDecoration", label: "Avatar Decoration" },
    { value: "globalName", label: "Name" },
    { value: "pronouns", label: "Pronouns" },
    { value: "customStatus", label: "Custom Status" },
    { value: "bio", label: "Bio" },
    { value: "profileColor", label: "Profile Color" },
    { value: "profileEffect", label: "Profile Effect" },
    { value: "profileFrame", label: "Profile Frame" },
    { value: "nameplate", label: "Nameplate" },
    { value: "displayNameStyles", label: "Name Style" },
    { value: "primaryGuildId", label: "Primary Guild" }
] as const satisfies ReadonlyArray<{ value: string; label: string; }>;

export const ALL_CARD_FIELDS = CARD_FIELD_OPTIONS.map(option => option.value);

export let presets: ProfilePresetEx[] = [];
export let basePresets: ProfilePresetEx[] = [];
export let currentPresetIndex = -1;
let activeScopeKey: string | null = null;

function resetPresets(nextPresets: ProfilePresetEx[] = []) {
    presets = nextPresets;
    currentPresetIndex = -1;
}

function getPresetsKey(section: PresetSection, userId: string, guildId?: string) {
    if (section === "main") return `${MAIN_PRESETS_KEY}:${userId}`;
    return guildId ? `${SERVER_PRESETS_KEY}:${userId}:${guildId}` : `${SERVER_PRESETS_KEY}:${userId}`;
}

function getLegacyServerKey(userId: string) {
    return `${SERVER_PRESETS_KEY}:${userId}`;
}

function getLegacyKey(userId: string) {
    return `${LEGACY_PRESETS_KEY}:${userId}:main`;
}

export async function loadPresets(section: PresetSection, guildId?: string) {
    try {
        const currentUser = UserStore.getCurrentUser();
        const userId = currentUser.id;
        const key = getPresetsKey(section, userId, guildId);
        activeScopeKey = key;
        const stored = await DataStore.get(key);
        if (stored && Array.isArray(stored)) {
            resetPresets(stored);
            return;
        }

        if (section === "server" && guildId) {
            const legacyKey = getLegacyServerKey(userId);
            const legacy = await DataStore.get(legacyKey);
            if (Array.isArray(legacy)) {
                const attributed = legacy.filter(preset => preset.primaryGuildId === guildId);
                if (attributed.length > 0) {
                    resetPresets(attributed);
                    const remaining = legacy.filter(preset => preset.primaryGuildId !== guildId);
                    if (remaining.length > 0) await DataStore.set(legacyKey, remaining);
                    else await DataStore.del(legacyKey);
                    await DataStore.set(key, attributed);
                    return;
                }
            }
        }

        if (section === "main") {
            const legacyKey = getLegacyKey(userId);
            const legacyStored = await DataStore.get(legacyKey);
            const legacyBaseStored = await DataStore.get(LEGACY_PRESETS_KEY);
            const legacyToUse = Array.isArray(legacyStored)
                ? legacyStored
                : (Array.isArray(legacyBaseStored) ? legacyBaseStored : null);
            if (legacyToUse) {
                resetPresets(legacyToUse);
                await DataStore.set(key, legacyToUse);
                await DataStore.del(legacyKey);
                await DataStore.del(LEGACY_PRESETS_KEY);
                return;
            }
        }
        resetPresets();
    } catch (err) {
        logger.error("Failed to load presets", err);
        resetPresets();
    }
}

export async function savePresetsData(section?: PresetSection, guildId?: string) {
    try {
        if (!activeScopeKey && !section) return;
        const currentUser = UserStore.getCurrentUser();
        const userId = currentUser.id;
        const key = section ? getPresetsKey(section, userId, guildId) : activeScopeKey;
        if (key) await DataStore.set(key, presets);
    } catch (err) {
        logger.error("Failed to save presets", err);
    }
}

export async function loadBasePresets() {
    try {
        const currentUser = UserStore.getCurrentUser();
        const userId = currentUser.id;
        const stored = await DataStore.get(`${MAIN_PRESETS_KEY}:${userId}`);
        basePresets = Array.isArray(stored) ? stored : [];
    } catch (err) {
        logger.error("Failed to load base presets", err);
        basePresets = [];
    }
}

export function clearBasePresets() {
    basePresets = [];
}

export function setCurrentPresetIndex(index: number) {
    currentPresetIndex = index;
}

export function addPreset(preset: ProfilePresetEx) {
    presets.push(preset);
}

export function updatePreset(index: number, preset: ProfilePresetEx) {
    if (index >= 0 && index < presets.length) {
        presets[index] = preset;
    }
}

export function removePreset(index: number) {
    if (index >= 0 && index < presets.length) {
        presets.splice(index, 1);
        if (currentPresetIndex === index) {
            currentPresetIndex = -1;
        } else if (currentPresetIndex > index) {
            currentPresetIndex--;
        }
    }
}

export function movePresetInArray(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= presets.length || toIndex < 0 || toIndex >= presets.length) return;
    const [preset] = presets.splice(fromIndex, 1);
    presets.splice(toIndex, 0, preset);
}

export function replaceAllPresets(newPresets: ProfilePresetEx[]) {
    presets = newPresets;
}

export async function deleteAllPresets(sections: ReadonlyArray<PresetSection>, guildId?: string) {
    const userId = UserStore.getCurrentUser().id;
    const keys = sections.flatMap(section => section === "main"
        ? [getPresetsKey("main", userId), getLegacyKey(userId), LEGACY_PRESETS_KEY]
        : [getPresetsKey("server", userId, guildId)]);
    await DataStore.delMany(keys);
    if (sections.includes("main")) basePresets = [];
    resetPresets();
}
