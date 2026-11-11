/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { LazyComponent } from "@utils/lazyReact";
import type { RenderModalProps, User } from "@vencord/discord-types";
import { filters, mapMangledModuleLazy } from "@webpack";
import { Checkbox, Modal, openModal, React, UserStore } from "@webpack/common";
import type { ComponentType } from "react";

import { buildPresetPreview, startPreview, stopPreview } from "../utils/profile";
import { type ProfilePresetEx } from "../utils/storage";

interface ConfirmModalProps extends RenderModalProps {
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    onCancel: () => void;
}

interface ImportProfilesModalProps extends RenderModalProps {
    title: string;
    message: string;
    onOverride: () => void;
    onMerge: () => void;
    onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmText, cancelText, onConfirm, onCancel, ...props }: ConfirmModalProps) {
    const closeAfter = (action: () => void) => () => {
        action();
        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={title}
            actions={[
                {
                    text: confirmText,
                    variant: "primary",
                    onClick: closeAfter(onConfirm)
                },
                {
                    text: cancelText,
                    variant: "secondary",
                    onClick: closeAfter(onCancel)
                }
            ]}
        >
            <Paragraph>{message}</Paragraph>
        </Modal>
    );
}

export function ImportProfilesModal({ title, message, onOverride, onMerge, onCancel, ...props }: ImportProfilesModalProps) {
    const closeAfter = (action: () => void) => () => {
        action();
        props.onClose();
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={title}
            actions={[
                {
                    text: "Override",
                    variant: "primary",
                    onClick: closeAfter(onOverride)
                },
                {
                    text: "Merge",
                    variant: "primary",
                    onClick: closeAfter(onMerge)
                },
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: closeAfter(onCancel)
                }
            ]}
        >
            <Paragraph>{message}</Paragraph>
        </Modal>
    );
}

interface DeleteAllProfilesModalProps extends RenderModalProps {
    onDelete: (sections: ("main" | "server")[]) => Promise<void>;
}

export function DeleteAllProfilesModal({ onDelete, ...props }: DeleteAllProfilesModalProps) {
    const [main, setMain] = React.useState(true);
    const [server, setServer] = React.useState(false);
    return (
        <Modal {...props} size="sm" title="Delete saved profiles" actions={[{
            text: "Delete",
            variant: "dangerPrimary",
            disabled: !main && !server,
            onClick: async () => {
                await onDelete([...(main ? ["main" as const] : []), ...(server ? ["server" as const] : [])]);
                props.onClose();
            }
        }]}>
            <Checkbox value={main} onChange={(_, checked: boolean) => setMain(checked)}>Main profiles</Checkbox>
            <Checkbox value={server} onChange={(_, checked: boolean) => setServer(checked)}>Server profiles</Checkbox>
        </Modal>
    );
}

interface NativeProfileModalProps extends RenderModalProps {
    user: User;
    currentUser: User;
    guildId?: string;
    openedAt: number;
    sourceAnalyticsLocations: string[];
}

const ProfileModalModule: { ProfileModal: ComponentType<NativeProfileModalProps>; } = mapMangledModuleLazy("user_profile_modal_edit", {
    ProfileModal: filters.componentByCode("children:", "{...")
});
const NativeProfileModal = LazyComponent(() => ProfileModalModule.ProfileModal);

function ProfilePreviewModal(props: RenderModalProps & { guildId?: string; }) {
    React.useEffect(() => stopPreview, []);
    const user = UserStore.getCurrentUser();
    return <NativeProfileModal {...props} user={user} currentUser={user} openedAt={Date.now()} sourceAnalyticsLocations={[]} />;
}

const SafeProfilePreviewModal = ErrorBoundary.wrap(ProfilePreviewModal);

export async function openProfilePreview(preset: ProfilePresetEx, guildId?: string, isGuildProfile?: boolean) {
    startPreview(await buildPresetPreview(preset, guildId, { isGuildProfile }));
    openModal(props => <SafeProfilePreviewModal {...props} guildId={isGuildProfile ? guildId : undefined} />);
}
