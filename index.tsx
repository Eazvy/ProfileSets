/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { SettingsSection } from "@components/settings/tabs/plugins/components/Common";
import { classNameFactory } from "@utils/css";
import { NoopComponent } from "@utils/react";
import definePlugin, { defineDefault, OptionType } from "@utils/types";
import type { CustomStatus } from "@vencord/discord-types";
import { React, SearchableSelect, SelectedGuildStore, Slider, UserProfileSettingsStore } from "@webpack/common";
import type { ReactElement } from "react";

import { PresetManager } from "./components/presetManager";
import { clearStatusSnapshot, isPreviewing, previewName as applyPreviewName, previewProfile as applyPreviewProfile, revertPresetStatus, stopPreview } from "./utils/profile";
import { ALL_CAPTURE_FIELDS, ALL_CARD_FIELDS, CAPTURE_FIELD_OPTIONS, CARD_FIELD_OPTIONS, loadPresets, type PresetSection } from "./utils/storage";

const SafePresetManager = ErrorBoundary.wrap(PresetManager, { noop: true });

export const cl = classNameFactory("vc-profile-presets-");

type FieldOption = { value: string; label: string; };

function MultiFieldSetting(props: { values: string[]; options: ReadonlyArray<FieldOption>; onChange: (next: string[]) => void; }) {
    return (
        <SearchableSelect
            multi
            options={props.options}
            value={props.values}
            placeholder="Select fields"
            closeOnSelect={false}
            maxVisibleItems={props.options.length}
            onChange={value => {
                const next = (value as Array<string | { value: string; }>).map(v => typeof v === "string" ? v : v.value);
                props.onChange(next);
            }}
        />
    );
}

type DisplaySettingKey =
    | "useBasePresetsForServerProfiles"
    | "showProfileEffect"
    | "animateProfileEffect"
    | "animateAvatarDecoration"
    | "animateBanner"
    | "cardsPerPage"
    | "captureFields"
    | "cardFields";

const DISPLAY_SETTING_KEYS: DisplaySettingKey[] = [
    "useBasePresetsForServerProfiles", "showProfileEffect", "animateProfileEffect",
    "animateAvatarDecoration", "animateBanner", "cardsPerPage", "captureFields", "cardFields"
];

function ProfileSetsSettings() {
    const [showAdditionalSettings, setShowAdditionalSettings] = React.useState(false);
    const {
        useBasePresetsForServerProfiles,
        showProfileEffect,
        animateProfileEffect,
        animateAvatarDecoration,
        animateBanner,
        cardsPerPage,
        captureFields,
        cardFields
    } = settings.use(DISPLAY_SETTING_KEYS);

    const animatePreviews = animateProfileEffect && animateAvatarDecoration && animateBanner;

    return (
        <SettingsSection name="Profile Sets" id="profileSetsSettings" description="Choose what preset cards show and how they behave.">
            <FormSwitch
                title="Show profile effects"
                description="Display saved profile effects on preset cards."
                value={showProfileEffect}
                onChange={value => { settings.store.showProfileEffect = value; }}
                hideBorder
            />
            <FormSwitch
                title="Animate previews"
                description="Animate profile effects, banners, and avatar decorations."
                value={animatePreviews}
                onChange={value => {
                    settings.store.animateProfileEffect = value;
                    settings.store.animateAvatarDecoration = value;
                    settings.store.animateBanner = value;
                }}
                hideBorder
            />
            <FormSwitch
                title="Use main profiles in server profiles"
                description="Show your main presets while editing a server profile."
                value={useBasePresetsForServerProfiles}
                onChange={value => { settings.store.useBasePresetsForServerProfiles = value; }}
                hideBorder
            />
            <Button size="small" variant="secondary" onClick={() => setShowAdditionalSettings(!showAdditionalSettings)}>
                {showAdditionalSettings ? "Hide additional settings" : "Additional settings"}
            </Button>
            {showAdditionalSettings && (
                <>
                    <SettingsSection name="Card layout" id="profileSetsLayout" description="Choose how many profiles appear on each page.">
                        <SettingsSection name="Cards per page" id="cardsPerPage" description="How many saved profiles appear on each page.">
                            <Slider
                                markers={[1, 2, 3, 4]}
                                minValue={1}
                                maxValue={4}
                                initialValue={cardsPerPage}
                                onValueChange={value => { settings.store.cardsPerPage = value; }}
                                onValueRender={(value: number) => String(value)}
                                stickToMarkers
                            />
                        </SettingsSection>
                    </SettingsSection>
                    <SettingsSection name="Preset fields" id="profileSetsFields" description="Choose which details are saved and shown.">
                        <SettingsSection name="Saved fields" id="captureFields" description="Details included when you save a preset.">
                            <MultiFieldSetting
                                values={captureFields}
                                options={CAPTURE_FIELD_OPTIONS}
                                onChange={value => { settings.store.captureFields = value; }}
                            />
                        </SettingsSection>
                        <SettingsSection name="Card fields" id="cardFields" description="Details shown on each preset card.">
                            <MultiFieldSetting
                                values={cardFields}
                                options={CARD_FIELD_OPTIONS}
                                onChange={value => { settings.store.cardFields = value; }}
                            />
                        </SettingsSection>
                    </SettingsSection>
                </>
            )}
        </SettingsSection>
    );
}

export const settings = definePluginSettings({
    avatarSize: {
        type: OptionType.SLIDER,
        description: "",
        markers: [56, 64, 72, 80, 88, 96],
        default: 56,
        hidden: true
    },
    useBasePresetsForServerProfiles: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false,
        hidden: true
    },
    showProfileEffect: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true,
        hidden: true
    },
    animateProfileEffect: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true,
        hidden: true
    },
    animateAvatarDecoration: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true,
        hidden: true
    },
    animateBanner: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true,
        hidden: true
    },
    cardsPerPage: {
        type: OptionType.SLIDER,
        description: "",
        markers: [1, 2, 3, 4],
        default: 2,
        stickToMarkers: true,
        hidden: true
    },
    captureFields: {
        type: OptionType.COMPONENT,
        component: NoopComponent,
        default: defineDefault<string[]>(ALL_CAPTURE_FIELDS),
        hidden: true
    },
    cardFields: {
        type: OptionType.COMPONENT,
        component: NoopComponent,
        default: defineDefault<string[]>(ALL_CARD_FIELDS),
        hidden: true
    },
    profileSetsSettings: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(ProfileSetsSettings, { noop: true }),
        default: defineDefault(true)
    }
});

export default definePlugin({
    name: "ProfileSets",
    description: "Save and apply presets for avatars, banners, bios, pronouns, colors, status emojis, avatar decorations, profile effects and frames, nameplates, and name styles. Includes server profiles, full previews, animated effects, and import/export.",
    authors: [{ name: "omaw", id: 1155026301791514655n }, { name: "justjxke", id: 852558183087472640n }],
    dependencies: ["UserSettingsAPI"],
    settings,
    patches: [
        {
            find: "viewFullBioDisabled:!0",
            group: true,
            replacement: [
                {
                    match: /(?<=hideBioSection:\i,pendingBadges:\i,)/,
                    replace: "profileSetsBioHeading:arguments[0].profileSetsPreview,"
                },
                {
                    match: /(?<=viewFullBioDisabled:!0)(?=\})/,
                    replace: ",profileSetsBioHeading:arguments[0].profileSetsBioHeading"
                }
            ]
        },
        {
            find: /viewFullBioDisabled:\i=!1/,
            replacement: {
                match: /(?<=hideHeading:)!0/,
                replace: "!arguments[0].profileSetsBioHeading,className:arguments[0].profileSetsBioHeading?'vc-profile-presets-bio':undefined"
            }
        },
        {
            find: "DefaultCustomizationSections: user cannot be undefined",
            replacement: {
                match: /return.{0,50}children:\[(?=.{0,50},\{placeholder:)/,
                replace: '$&$self.renderPresetSection("main"),'
            }
        },
        {
            find: "USER_SETTINGS_GUILD_PROFILE)",
            replacement: {
                match: /guildId:(\i\.id),onChange:(\i)\}\)(?=.{0,25}?profilePreviewTitle:)/,
                replace: 'guildId:$1,onChange:$2}),$self.renderPresetSection("server",$1)'
            }
        },
        {
            find: "user_profile_modal_edit",
            replacement: [
                {
                    match: /(?<=\.useCallback\(\(\)=>\(0,\i\.A\)\()\i(?=,\i\),\[\i,\i\]\))/,
                    replace: "!$self.previewing()&&$&"
                },
                {
                    match: /(?<="UserProfileModalV2"\).{0,150}?,\i=)\(0,\i\.\i\)\(\i\.id\)&&\i/,
                    replace: "$&&&!$self.previewing()"
                },
                {
                    match: /(?<=children:\[)\i&&\(\i\?\(0,\i\.jsx\)\(\i,\{\}\):\(0,\i\.jsx\)\(\i,\{\}\)\),\i&&\(0,\i\.jsx\)\(\i,\{\}\),/,
                    replace: "$&$self.renderEditorPresetSection(arguments[0]),"
                },
                {
                    match: /\i\?"try-it-out":\i\?"edit":"read-only"/,
                    replace: '$self.previewing()?"read-only":$&'
                },
                {
                    match: /if\("read-only"===(\i)\)return (\i);/,
                    replace: 'if("read-only"===$1&&!$self.previewing())return $2;'
                },
                {
                    match: /(?<=\i=)(\(0,\i\.Ay\)\((\i)\.id,(\i)\))(?=;)/,
                    replace: "$self.previewProfile($&)"
                },
                {
                    match: /displayProfile:(\i),nickname:(\i),originGuildId:/,
                    replace: "displayProfile:$1,nickname:$self.previewName($2),originGuildId:"
                },
                {
                    match: /useState\(\(\)=>window\.innerWidth>928\)/,
                    replace: "useState(()=>$self.previewing()?!1:window.innerWidth>928)"
                }
            ]
        },
        {
            find: "profileEffectRestartKey",
            group: true,
            replacement: [
                {
                    match: /\(0,(\i)\.jsx\)\((\i)\.A,\{skuId:(\i)\.skuId,restartKey:(\i)\}\)/,
                    replace: "(0,$1.jsx)($2.A,{skuId:$3.skuId,restartKey:$4,...$self.profileEffectPreviewProps(arguments[0])})"
                },
                {
                    match: /(?<=showPending:!0)(?=\}\))/,
                    replace: ",animateOnHover:$self.animateAvatarDecoration()"
                }
            ]
        },
        {
            find: /themePadding:\i,pendingAccentColor:\i,animateOnHoverOrFocusOnly:/,
            replacement: [
                {
                    match: /canAnimate:(\i\|\|!\i\?\i:\i)/,
                    replace: "canAnimate:($1)&&$self.animateBanner()"
                },
                {
                    match: /overlay:(\i),onInteractionStart:/,
                    replace: "overlay:$1,profileSetsPreview:arguments[0].pendingBanner?.profileSetsPreview,onInteractionStart:"
                }
            ]
        },
        {
            find: "--custom-cutout-radius",
            replacement: {
                match: /onMouseMove:(\i),onMouseLeave:(\i)/,
                replace: "onClickCapture:$self.previewBannerClickHandler(arguments[0]),onMouseMove:$1,onMouseLeave:$2"
            }
        },
        {
            find: ".POPOUT,disableToolbar:",
            replacement: {
                match: /\(0,\i\.jsx\)\(\i\.A,\{user:\i,themeType:\i\.\i\.POPOUT,disableToolbar:\i\}\)/,
                replace: "$self.customStatus(arguments[0],$&)"
            }
        }
    ],
    flux: {
        USER_PROFILE_MODAL_CLOSE() {
            stopPreview();
        },
        USER_PROFILE_SETTINGS_RESET_PENDING_CHANGES() {
            revertPresetStatus();
        },
        USER_PROFILE_SETTINGS_RESET_PENDING_PROFILE_CHANGES() {
            revertPresetStatus();
        },
        USER_PROFILE_SETTINGS_RESET_AND_CLOSE_FORM() {
            revertPresetStatus();
        },
        USER_PROFILE_SETTINGS_SUBMIT_SUCCESS() {
            clearStatusSnapshot();
        }
    },
    start() {
        loadPresets("main");
    },
    previewing() {
        return isPreviewing();
    },
    animateAvatarDecoration() {
        return settings.store.animateAvatarDecoration;
    },
    animateBanner() {
        return settings.store.animateBanner;
    },
    profileEffectPreviewProps({ profileSetsPreview, autoPlayProfileEffect = false }: { profileSetsPreview?: boolean; autoPlayProfileEffect?: boolean; }) {
        return profileSetsPreview ? {
            autoPlay: autoPlayProfileEffect,
            isHovering: autoPlayProfileEffect,
            useThumbnail: !autoPlayProfileEffect,
            shopPreview: true,
            resetOnHover: true,
            delayIntro: false
        } : {};
    },
    previewBannerClickHandler(pendingBanner?: { profileSetsPreview?: boolean; }) {
        if (!pendingBanner?.profileSetsPreview) return;
        return (event: { preventDefault(): void; stopPropagation(): void; }) => {
            event.preventDefault();
            event.stopPropagation();
        };
    },
    previewProfile(profile: Parameters<typeof applyPreviewProfile>[0]) {
        return applyPreviewProfile(profile);
    },
    customStatus(props: { guild?: { id: string; }; guildId?: string; originGuildId?: string; pendingCustomStatus?: CustomStatus; }, defaultNode: ReactElement<Record<string, unknown>>) {
        const guildId = props?.guild?.id ?? props?.guildId ?? props?.originGuildId ?? SelectedGuildStore.getGuildId() ?? SelectedGuildStore.getLastSelectedGuildId();
        const pending = guildId ? UserProfileSettingsStore.getPendingChanges(guildId) : undefined;
        const cs = props?.pendingCustomStatus ?? pending?.pendingCustomStatus;
        if (cs) {
            return React.createElement(defaultNode.type, {
                ...defaultNode.props,
                previewText: cs.text ?? "",
                previewEmoji: cs.emojiName || (cs.emojiId && cs.emojiId !== "0")
                    ? { id: cs.emojiId && cs.emojiId !== "0" ? cs.emojiId : undefined, name: cs.emojiName ?? "", animated: false }
                    : undefined
            });
        }
        return defaultNode;
    },
    previewName(name: unknown) {
        return applyPreviewName(name);
    },
    renderPresetSection(section: PresetSection, guildId?: string) {
        return <SafePresetManager section={section} guildId={guildId} />;
    },
    renderEditorPresetSection({ selectedGuildId }: { selectedGuildId?: string | null; }) {
        return this.renderPresetSection(selectedGuildId ? "server" : "main", selectedGuildId ?? undefined);
    },
    stop() {
        stopPreview();
    }
});
