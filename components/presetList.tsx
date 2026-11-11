/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { isNonNullish } from "@utils/guards";
import { classes } from "@utils/misc";
import { ProfilePreset } from "@vencord/discord-types";
import { Menu, Popout, React, TextInput } from "@webpack/common";
import type { ReactNode } from "react";

import { cl, settings } from "..";
import { deletePreset, movePreset, renamePreset, updatePresetField } from "../utils/actions";
import { getCurrentProfile } from "../utils/profile";
import { PresetSection, type ProfilePresetEx } from "../utils/storage";
import { openProfilePreview } from "./modals";
import { PresetCard } from "./presetCard";

interface PresetListProps {
    presets: ProfilePresetEx[];
    allPresets: ProfilePresetEx[];
    selectedPreset: number;
    onLoad: (preset: ProfilePresetEx, index: number) => void;
    onUpdate: () => void;
    isReadOnly?: (preset: ProfilePresetEx) => boolean;
    guildId?: string;
    isGuildProfile: boolean;
    section: PresetSection;
    currentPage: number;
    onPageChange: (page: number) => void;
}

function PresetMenuButton({ renderMenu }: { renderMenu: (close: () => void) => ReactNode; }) {
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    return (
        <Popout
            targetElementRef={buttonRef}
            position="bottom"
            align="right"
            renderPopout={({ closePopout }) => renderMenu(closePopout)}
        >
            {props => (
                <Button
                    {...props}
                    ref={buttonRef}
                    size="iconOnly"
                    variant="none"
                    className={cl("menu-icon")}
                    aria-label="Preset options"
                    onClick={event => {
                        event.stopPropagation();
                        props.onClick(event);
                    }}
                    onKeyDown={event => {
                        event.stopPropagation();
                        props.onKeyDown(event);
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                        <path fill="currentColor" d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                    </svg>
                </Button>
            )}
        </Popout>
    );
}

export function PresetList({
    presets,
    allPresets,
    selectedPreset,
    onLoad,
    onUpdate,
    isReadOnly,
    guildId,
    isGuildProfile,
    section,
    currentPage,
    onPageChange
}: PresetListProps) {
    type EditableProfile = Omit<ProfilePreset, "name" | "timestamp">;
    const [renaming, setRenaming] = React.useState<number>(-1);
    const [renameText, setRenameText] = React.useState("");
    const { cardFields } = settings.use(["cardFields"]);

    return (
        <div className={cl("list-container")}>
            {presets.map(preset => {
                const actualIndex = allPresets.indexOf(preset);
                const readOnly = isReadOnly?.(preset) ?? false;
                const isRenaming = !readOnly && renaming === actualIndex;
                const isSelected = !isRenaming && !readOnly && selectedPreset === actualIndex;
                const date = new Date(preset.timestamp);
                const formattedDate = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
                const formattedTime = date.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit"
                });

                const commitRename = () => {
                    if (readOnly) return;
                    const nextName = renameText.trim();
                    if (!nextName) return;
                    renamePreset(actualIndex, nextName, section, guildId);
                    onUpdate();
                };

                const showMoveOptions = !readOnly && (actualIndex > 0 || actualIndex < allPresets.length - 1 || currentPage > 1);

                return (
                    <div
                        key={`${preset.timestamp}-${preset.name}`}
                        tabIndex={isRenaming ? -1 : 0}
                        role="button"
                        onClick={() => {
                            if (!isRenaming) {
                                onLoad(preset, actualIndex);
                            }
                        }}
                        onKeyDown={e => {
                            if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                onLoad(preset, actualIndex);
                            }
                        }}
                        className={classes(cl("row"), isSelected ? "selected" : "")}
                        style={{ position: "relative", padding: 0, width: "100%" }}
                    >
                        <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 10, display: "flex", gap: "8px", alignItems: "center" }}>
                            <div className={cl("rename")} style={{ background: "rgba(0, 0, 0, 0.5)", padding: "4px 8px", borderRadius: "8px" }}>
                                {isRenaming ? (
                                    <TextInput
                                        value={renameText}
                                        onChange={setRenameText}
                                        onBlur={() => {
                                            commitRename();
                                            setRenaming(-1);
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                commitRename();
                                                setRenaming(-1);
                                            } else if (e.key === "Escape") {
                                                setRenaming(-1);
                                            }
                                            e.stopPropagation();
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        autoFocus
                                    />
                                ) : (
                                    <div className={cl("name")} style={{ color: "white" }}>
                                        {preset.name}
                                    </div>
                                )}
                            </div>
                            <div className={cl("updated")} style={{ background: "rgba(0, 0, 0, 0.5)", padding: "4px", borderRadius: "50%" }}>
                                <PresetMenuButton renderMenu={closePopout => (
                                            <Menu.Menu navId="preset-options" onClose={closePopout}>
                                                {!readOnly && (
                                                    <Menu.MenuItem
                                                        id="rename"
                                                        label="Rename"
                                                        action={() => {
                                                            setRenaming(actualIndex);
                                                            setRenameText(preset.name);
                                                        }}
                                                    />
                                                )}
                                                {!readOnly && (
                                                    <Menu.MenuItem
                                                        id="update"
                                                        label="Update"
                                                        action={async () => {
                                                            const profile = await getCurrentProfile(guildId, { isGuildProfile });
                                                            await Promise.all(
                                                                (Object.entries(profile) as [keyof EditableProfile, EditableProfile[keyof EditableProfile]][])
                                                                    .filter(([, value]) => isNonNullish(value))
                                                                    .map(([key, value]) => updatePresetField(actualIndex, key, value, section, guildId))
                                                            );
                                                            onUpdate();
                                                        }}
                                                    />
                                                )}
                                                <Menu.MenuItem
                                                    id="preview"
                                                    label="Preview Full Profile"
                                                    action={() => openProfilePreview(preset, guildId, isGuildProfile)}
                                                />
                                                {showMoveOptions && <Menu.MenuSeparator />}
                                                {!readOnly && actualIndex > 0 && (
                                                    <Menu.MenuItem
                                                        id="move-up"
                                                        label="Move Up"
                                                        action={() => {
                                                            movePreset(actualIndex, actualIndex - 1, section, guildId);
                                                            onUpdate();
                                                        }}
                                                    />
                                                )}
                                                {!readOnly && actualIndex < allPresets.length - 1 && (
                                                    <Menu.MenuItem
                                                        id="move-down"
                                                        label="Move Down"
                                                        action={() => {
                                                            movePreset(actualIndex, actualIndex + 1, section, guildId);
                                                            onUpdate();
                                                        }}
                                                    />
                                                )}
                                                {!readOnly && currentPage > 1 && (
                                                    <Menu.MenuItem
                                                        id="move-to-page-1"
                                                        label="Move to Page 1"
                                                        action={() => {
                                                            movePreset(actualIndex, 0, section, guildId);
                                                            onPageChange(1);
                                                            onUpdate();
                                                        }}
                                                    />
                                                )}
                                                {!readOnly && <Menu.MenuSeparator />}
                                                {!readOnly && (
                                                    <Menu.MenuItem
                                                        id="delete"
                                                        label="Delete"
                                                        color="danger"
                                                        action={async () => {
                                                            await deletePreset(actualIndex, section, guildId);
                                                            onUpdate();
                                                        }}
                                                    />
                                                )}
                                            </Menu.Menu>
                                )} />
                            </div>
                        </div>
                        <PresetCard preset={preset} fields={cardFields} guildId={guildId} onSelect={() => onLoad(preset, actualIndex)} />
                    </div>
                );
            })}
        </div>
    );
}
