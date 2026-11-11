/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { CogWheel } from "@components/Icons";
import { classes } from "@utils/misc";
import { ContextMenuApi, Menu, openModal, React, SelectedGuildStore, TextInput, useStateFromStores } from "@webpack/common";
import { ContextMenuStore } from "@webpack/common/stores";

import { cl, settings } from "../index";
import { exportPresets, ImportDecision, importPresets, savePreset } from "../utils/actions";
import { loadPresetAsPending } from "../utils/profile";
import { basePresets, clearBasePresets, deleteAllPresets, loadBasePresets, loadPresets, presets, PresetSection, type ProfilePresetEx } from "../utils/storage";
import { DeleteAllProfilesModal, ImportProfilesModal } from "./modals";
import { PresetList } from "./presetList";

const CARDS_PER_PAGE_KEYS: ("cardsPerPage")[] = ["cardsPerPage"];

type PresetManagerProps = {
    section?: PresetSection;
    guildId?: string;
    hideHeading?: boolean;
};

export function PresetManager({ section, guildId, hideHeading }: PresetManagerProps) {
    const [presetName, setPresetName] = React.useState("");
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const [isSaving, setIsSaving] = React.useState(false);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [pageInput, setPageInput] = React.useState("1");
    const [selectedPreset, setSelectedPreset] = React.useState<number>(-1);
    const [searchMode, setSearchMode] = React.useState(false);
    const lastRandomIndexRef = React.useRef<number>(-1);
    const resolvedSection: PresetSection = section ?? "main";
    const isServerSection = resolvedSection === "server";
    const lastSelectedGuildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getLastSelectedGuildId() ?? SelectedGuildStore.getGuildId());
    const { useBasePresetsForServerProfiles } = settings.use(["useBasePresetsForServerProfiles"]);
    const { cardsPerPage } = settings.use(CARDS_PER_PAGE_KEYS);
    const presetsPerPage = Math.min(4, Math.max(1, cardsPerPage));
    const resolvedGuildId = isServerSection ? (guildId ?? lastSelectedGuildId ?? undefined) : undefined;
    const canUseGuild = !isServerSection || Boolean(resolvedGuildId);
    // Use a ref to track the last clicked preset index, preventing the useEffect from resetting it
    const lastClickedPresetRef = React.useRef<number>(-1);
    lastClickedPresetRef.current = selectedPreset;
    const storageSection: PresetSection = isServerSection ? "server" : "main";
    const showBasePresets = isServerSection && useBasePresetsForServerProfiles;

    React.useEffect(() => {
        let isActive = true;
        (async () => {
            await loadPresets(storageSection, resolvedGuildId);
            if (showBasePresets) await loadBasePresets();
            else clearBasePresets();
            if (!isActive) return;
            // Only reset selectedPreset if no preset was just clicked.
            // The ref tracks the last clicked preset index.
            // By not including selectedPreset in deps, the effect won't run on preset clicks,
            // allowing the selection state to persist across clicks.
            // It will still run when resolvedSection/resolvedGuildId changes.
            if (selectedPreset !== lastClickedPresetRef.current) {
                setSelectedPreset(-1);
            }
            setCurrentPage(1);
            setPageInput("1");
            forceUpdate();
        })();
        return () => {
            isActive = false;
        };
    }, [resolvedGuildId, resolvedSection, storageSection, showBasePresets]);

    const filteredPresets = !searchMode
        ? (showBasePresets ? [...basePresets, ...presets] : presets)
        : (showBasePresets ? [...basePresets, ...presets] : presets).filter(preset => preset.name.toLowerCase().includes(presetName.toLowerCase()));

    const totalPages = Math.ceil(filteredPresets.length / presetsPerPage);
    const startIndex = (currentPage - 1) * presetsPerPage;
    const currentPresets = filteredPresets.slice(startIndex, startIndex + presetsPerPage);

    React.useEffect(() => {
        if (totalPages && currentPage > totalPages) {
            setCurrentPage(totalPages);
            setPageInput(String(totalPages));
        }
    }, [currentPage, totalPages]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > Math.max(1, totalPages)) return;
        setCurrentPage(newPage);
        setPageInput(String(newPage));
    };

    const handleSavePreset = async () => {
        const trimmedName = presetName.trim();
        if (!canUseGuild || !trimmedName) return;
        setIsSaving(true);
        await savePreset(trimmedName, storageSection, resolvedGuildId, {
            isGuildProfile: isServerSection,
            captureFields: settings.store.captureFields
        });
        setPresetName("");
        setIsSaving(false);
        const newTotalPages = Math.ceil(presets.length / presetsPerPage);
        handlePageChange(newTotalPages);
        forceUpdate();
    };

    const applyPreset = (preset: ProfilePresetEx | undefined) => {
        if (!preset) return;
        const index = presets.indexOf(preset);
        // Store the clicked index in ref before loading the preset
        lastClickedPresetRef.current = index;
        setSelectedPreset(index);
        const isServerPreset = isServerSection;
        loadPresetAsPending(preset, isServerPreset ? resolvedGuildId : undefined, {
            isGuildProfile: isServerPreset
        });
        forceUpdate();
    };

    const handleLoadPreset = (preset: ProfilePresetEx) => {
        if (!canUseGuild) return;
        applyPreset(preset);
    };

    const handleRandomPreset = () => {
        if (!canUseGuild) return;
        if (!presets.length) return;
        let nextIndex = Math.floor(Math.random() * presets.length);
        if (presets.length > 1 && nextIndex === lastRandomIndexRef.current) {
            let attempts = 0;
            while (attempts < 5 && nextIndex === lastRandomIndexRef.current) {
                nextIndex = Math.floor(Math.random() * presets.length);
                attempts++;
            }
        }
        lastRandomIndexRef.current = nextIndex;
        applyPreset(presets[nextIndex]);
    };

    const showImportPrompt = (existingCount: number): Promise<ImportDecision> => {
        return new Promise(resolve => {
            openModal(props => (
                <ImportProfilesModal
                    {...props}
                    title="Import Profiles"
                    message={`You have ${existingCount} existing profiles in this section. Do you want to override them or merge with imported profiles?`}
                    onOverride={() => resolve("override")}
                    onMerge={() => resolve("merge")}
                    onCancel={() => resolve("cancel")}
                />
            ));
        });
    };

    const showDeleteAllPrompt = () => {
        openModal(props => (
            <DeleteAllProfilesModal
                {...props}
                onDelete={async sections => {
                    await deleteAllPresets(sections, resolvedGuildId);
                    await loadPresets(storageSection, resolvedGuildId);
                    if (showBasePresets) await loadBasePresets();
                    setSelectedPreset(-1);
                    setCurrentPage(1);
                    setPageInput("1");
                    forceUpdate();
                }}
            />
        ));
    };

    const hasPresets = presets.length > 0;
    const shouldShowPagination = filteredPresets.length > presetsPerPage;

    return (
        <div className={classes(cl("section"), isServerSection ? cl("section-server") : "")} >
            {!hideHeading && (
                <Heading tag="h3" className={cl("heading")}>
                    Profile Sets
                </Heading>
            )}

            <div className={cl("text")}>
                <TextInput
                    placeholder={searchMode ? "Search profiles..." : "Profile Name"}
                    value={presetName}
                    onChange={setPresetName}
                    className={cl("text-input")}
                />
            </div>

            <div className={cl("search")}>
                {!searchMode && (
                    <Button
                        size="small"
                        disabled={isSaving || !presetName.trim() || !canUseGuild}
                        onClick={handleSavePreset}
                        className={cl("search-button")}
                    >
                        {isSaving ? "Saving..." : "Save Profile"}
                    </Button>
                )}
                {!searchMode && hasPresets && (
                    <Button
                        size="small"
                        variant={searchMode ? "primary" : "secondary"}
                        className={cl("search-toggle")}
                        onClick={() => {
                            setSearchMode(!searchMode);
                            handlePageChange(1);
                        }}
                    >
                        {searchMode ? "Cancel Search" : "Search"}
                    </Button>
                )}
                {!searchMode && (
                    <Button
                        size="small"
                        variant="secondary"
                        className={cl("actions-button")}
                        aria-label="Profile actions"
                        title="Profile actions"
                        onClick={e => {
                            e.stopPropagation();
                            const currentMenuTarget = ContextMenuStore.getContextMenu()?.target;
                            if (currentMenuTarget instanceof Node && e.currentTarget.contains(currentMenuTarget)) {
                                ContextMenuApi.closeContextMenu();
                                return;
                            }
                            ContextMenuApi.openContextMenu(e, () => (
                                <Menu.Menu navId="profile-presets-actions" onClose={ContextMenuApi.closeContextMenu}>
                                    <Menu.MenuItem
                                        id="random"
                                        label="Random"
                                        disabled={!hasPresets || !canUseGuild}
                                        action={handleRandomPreset}
                                    />
                                    <Menu.MenuItem
                                        id="import"
                                        label="Import"
                                        disabled={!canUseGuild}
                                        action={() => importPresets(forceUpdate, showImportPrompt, storageSection, resolvedGuildId)}
                                    />
                                    <Menu.MenuItem
                                        id="export-all"
                                        label="Export All"
                                        disabled={!hasPresets}
                                        action={() => exportPresets(storageSection, resolvedGuildId)}
                                    />
                                    <Menu.MenuSeparator />
                                    <Menu.MenuItem
                                        id="delete-all"
                                        label="Delete All Profile Sets"
                                        action={showDeleteAllPrompt}
                                    />
                                </Menu.Menu>
                            ));
                        }}
                    >
                        <CogWheel className={cl("actions-icon")} />
                    </Button>
                )}
                {searchMode && (
                    <Button
                        size="small"
                        variant="primary"
                        onClick={() => {
                            setSearchMode(!searchMode);
                            handlePageChange(1);
                        }}
                    >
                        Cancel Search
                    </Button>
                )}
            </div>

            {hasPresets && (
                <>
                    <PresetList
                        presets={currentPresets}
                        allPresets={presets}
                        selectedPreset={selectedPreset}
                        onLoad={handleLoadPreset}
                        isReadOnly={p => !presets.includes(p)}
                        onUpdate={() => {
                            const newTotal = Math.ceil(presets.length / presetsPerPage);
                            if (newTotal === 0) {
                                handlePageChange(1);
                            } else if (currentPage > newTotal) {
                                handlePageChange(newTotal);
                            }
                            forceUpdate();
                        }}
                        guildId={resolvedGuildId}
                        isGuildProfile={isServerSection}
                        section={storageSection}
                        currentPage={currentPage}
                        onPageChange={handlePageChange}
                    />

                    {shouldShowPagination && (
                        <div className={cl("pagination")}>
                            <Button
                                size="small"
                                variant="secondary"
                                disabled={currentPage === 1}
                                onClick={() => handlePageChange(currentPage - 1)}
                            >
                                ←
                            </Button>
                            <div className={cl("page")}>
                                <input
                                    type="text"
                                    value={pageInput}
                                    onChange={e => {
                                        const { value } = e.target;
                                        setPageInput(value);
                                        const num = parseInt(value);
                                        if (!isNaN(num) && num >= 1 && num <= totalPages) {
                                            setCurrentPage(num);
                                        }
                                    }}
                                    className={cl("page-input")}
                                />
                                <span className={cl("page-divider")}>/</span>
                                <span className={cl("page-total")}>{totalPages}</span>
                            </div>
                            <Button
                                size="small"
                                variant="secondary"
                                disabled={currentPage === totalPages}
                                onClick={() => handlePageChange(currentPage + 1)}
                            >
                                →
                            </Button>
                        </div>
                    )}

                    <hr className={cl("block")} />
                </>
            )}

            <hr className={cl("block")} />
            {resolvedSection === "server" && (
                <hr className={cl("block")} />
            )}
        </div>
    );
}
