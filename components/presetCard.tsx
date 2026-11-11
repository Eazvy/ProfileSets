/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { findComponentByCodeLazy } from "@webpack";
import { GuildStore, IconUtils, React, UserStore } from "@webpack/common";

import { settings } from "../index";
import { type ProfilePresetEx } from "../utils/storage";

const cl = classNameFactory("vc-profile-sets-");

const ProfileModal = findComponentByCodeLazy<Record<string, unknown>>("isTryItOut:", "pendingThemeColors:", "pendingAvatarDecoration:", "EDIT_PROFILE_BANNER");
const ANIMATION_SETTING_KEYS: ("showProfileEffect" | "animateProfileEffect" | "animateAvatarDecoration" | "animateBanner")[] = ["showProfileEffect", "animateProfileEffect", "animateAvatarDecoration", "animateBanner"];

interface PresetCardProps {
    preset: ProfilePresetEx;
    fields: string[];
    guildId?: string;
    onSelect: () => void;
}

type PendingAsset = string | null | undefined | { assetOrigin: string; imageUri: string; staticImageUri?: string; description: string; profileSetsPreview?: boolean; };

export function PresetCard({ preset, fields, guildId, onSelect }: PresetCardProps) {
    const enabled = new Set(fields);
    const currentUser = UserStore.getCurrentUser();
    const { showProfileEffect, animateProfileEffect, animateAvatarDecoration, animateBanner } = settings.use(ANIMATION_SETTING_KEYS);
    const [isHovered, setIsHovered] = React.useState(false);

    const profileColorOn = enabled.has("profileColor");

    const pendingThemeColors = profileColorOn ? preset.themeColors : null;
    const pendingAccentColor = profileColorOn ? preset.accentColor : null;
    const pendingAvatarDecoration = enabled.has("avatarDecoration") ? preset.avatarDecoration : "";
    const pendingProfileEffect = showProfileEffect && enabled.has("profileEffect")
        ? preset.profileEffect && !animateProfileEffect
            ? {
                ...preset.profileEffect,
                reducedMotionSrc: preset.profileEffect.reducedMotionSrc ?? preset.profileEffect.staticFrameSrc ?? preset.profileEffect.thumbnailPreviewSrc
            }
            : preset.profileEffect
        : "";

    let pendingBanner: PendingAsset = enabled.has("bannerDataUrl") ? preset.bannerDataUrl : null;
    if (pendingBanner && typeof pendingBanner === "string" && pendingBanner.startsWith("data:")) {
        pendingBanner = {
            assetOrigin: "NEW_ASSET",
            imageUri: pendingBanner,
            description: "preset-banner"
        };
    }

    const bannerImageUri = typeof pendingBanner === "string" ? pendingBanner : pendingBanner?.imageUri;
    const [staticBanner, setStaticBanner] = React.useState<{ source: string; uri: string; } | null>(null);

    React.useEffect(() => {
        if (animateBanner || !bannerImageUri?.startsWith("data:image/gif")) {
            setStaticBanner(null);
            return;
        }

        let objectUrl: string | undefined;
        let disposed = false;

        void (async () => {
            const response = await fetch(bannerImageUri);
            const bitmap = await createImageBitmap(await response.blob());
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            if (!context) {
                bitmap.close();
                return;
            }

            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            objectUrl = URL.createObjectURL(await canvas.convertToBlob());
            if (disposed) URL.revokeObjectURL(objectUrl);
            else setStaticBanner({ source: bannerImageUri, uri: objectUrl });
        })().catch(() => setStaticBanner(null));

        return () => {
            disposed = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [animateBanner, bannerImageUri]);

    const previewBanner: PendingAsset = typeof pendingBanner === "string"
        ? { assetOrigin: "NEW_ASSET", imageUri: pendingBanner, description: "preset-banner", profileSetsPreview: true }
        : pendingBanner && typeof pendingBanner === "object"
            ? {
                ...pendingBanner,
                profileSetsPreview: true,
                staticImageUri: bannerImageUri && staticBanner?.source === bannerImageUri
                    ? (animateBanner ? undefined : staticBanner.uri)
                    : pendingBanner.staticImageUri
            }
            : pendingBanner;

    const previewDecoration = pendingAvatarDecoration;

    let pendingAvatar: PendingAsset = enabled.has("avatarDataUrl") ? preset.avatarDataUrl : null;
    if (pendingAvatar && typeof pendingAvatar === "string" && pendingAvatar.startsWith("data:")) {
        pendingAvatar = {
            assetOrigin: "NEW_ASSET",
            imageUri: pendingAvatar,
            description: "preset-avatar"
        };
    } else if (pendingAvatar == null && enabled.has("avatarDataUrl")) {
        pendingAvatar = IconUtils.getDefaultAvatarURL(currentUser.id);
    }

    const pendingBio = enabled.has("bio") ? preset.bio : null;
    const pendingPronouns = enabled.has("pronouns") ? preset.pronouns : null;

    const { customStatus } = preset;
    const hasCustomStatus = enabled.has("customStatus")
        && Boolean(customStatus?.text?.trim() || customStatus?.emojiName || (customStatus?.emojiId && customStatus.emojiId !== "0"));

    const pendingGlobalName = enabled.has("globalName") ? preset.globalName : undefined;
    const pendingNickname = enabled.has("globalName") ? preset.globalName : undefined;
    const pendingProfileFrame = enabled.has("profileFrame") ? preset.profileFrame : "";
    const pendingPrimaryGuildId = enabled.has("primaryGuildId") ? preset.primaryGuildId : null;
    const pendingDisplayNameStyles = enabled.has("displayNameStyles") ? preset.displayNameStyles : null;

    return (
        <div
            onClickCapture={event => {
                event.stopPropagation();
                onSelect();
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={classes(
                cl("card-preview"),
                animateProfileEffect && cl("animate-profile-effect"),
                animateAvatarDecoration && cl("animate-avatar-decoration"),
                animateBanner && cl("animate-banner")
            )}
            style={{ zoom: 0.80 }}
        >
            <ProfileModal
                profileSetsPreview={true}
                user={currentUser}
                guild={guildId ? GuildStore.getGuild(guildId) : undefined}
                canUsePremiumCustomization={false}
                disabledInputs={true}
                hideExampleButton={true}
                hideFakeActivity={true}
                isTryItOut={false}
                pendingThemeColors={pendingThemeColors}
                pendingAvatarDecoration={previewDecoration}
                pendingProfileEffect={pendingProfileEffect}
                autoPlayProfileEffect={animateProfileEffect}
                profileEffectRestartKey={preset.profileEffect?.skuId}
                pendingBanner={animateBanner ? previewBanner : typeof previewBanner === "object" && previewBanner
                    ? { ...previewBanner, staticImageUri: previewBanner.staticImageUri ?? previewBanner.imageUri }
                    : previewBanner}
                pendingAvatar={pendingAvatar}
                pendingBio={pendingBio}
                pendingPronouns={pendingPronouns}
                pendingAccentColor={pendingAccentColor}
                pendingGlobalName={pendingGlobalName}
                pendingNickname={pendingNickname}
                pendingProfileFrame={pendingProfileFrame}
                pendingPrimaryGuildId={pendingPrimaryGuildId}
                pendingDisplayNameStyles={pendingDisplayNameStyles}
                pendingBadges={[]}
                pendingCustomStatus={enabled.has("customStatus") ? (preset.customStatus ?? null) : null}
                hideCustomStatus={!hasCustomStatus}
                hideProfileFrame={!enabled.has("profileFrame")}
                hideBioSection={false}
                interactive={false}
                isHovering={isHovered && animateProfileEffect}
                forceHover={isHovered && animateProfileEffect}
            />
        </div>
    );
}
