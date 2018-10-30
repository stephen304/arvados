// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { dialogActions } from "~/store/dialog/dialog-actions";
import { withDialog } from "~/store/dialog/with-dialog";
import { SHARING_DIALOG_NAME, SharingPublicAccessFormData, SHARING_PUBLIC_ACCESS_FORM_NAME, SHARING_INVITATION_FORM_NAME, SharingManagementFormData, SharingInvitationFormData, VisibilityLevel, getSharingMangementFormData, getSharingPublicAccessFormData } from './sharing-dialog-types';
import { Dispatch } from 'redux';
import { ServiceRepository } from "~/services/services";
import { FilterBuilder } from '~/services/api/filter-builder';
import { initialize, getFormValues, isDirty, reset } from 'redux-form';
import { SHARING_MANAGEMENT_FORM_NAME } from '~/store/sharing-dialog/sharing-dialog-types';
import { RootState } from '~/store/store';
import { getDialog } from '~/store/dialog/dialog-reducer';
import { PermissionLevel } from '~/models/permission';
import { getPublicGroupUuid } from "~/store/workflow-panel/workflow-panel-actions";
import { PermissionResource } from '~/models/permission';
import { differenceWith } from "lodash";

export const openSharingDialog = (resourceUuid: string) =>
    (dispatch: Dispatch) => {
        dispatch(dialogActions.OPEN_DIALOG({ id: SHARING_DIALOG_NAME, data: resourceUuid }));
        dispatch<any>(loadSharingDialog);
    };

export const closeSharingDialog = () =>
    dialogActions.CLOSE_DIALOG({ id: SHARING_DIALOG_NAME });

export const connectSharingDialog = withDialog(SHARING_DIALOG_NAME);

export const saveSharingDialogChanges = async (dispatch: Dispatch) => {
    await dispatch<any>(savePublicPermissionChanges);
    await dispatch<any>(saveManagementChanges);
    await dispatch<any>(sendInvitations);
    dispatch(reset(SHARING_INVITATION_FORM_NAME));
    await dispatch<any>(loadSharingDialog);
};

export const hasChanges = (state: RootState) =>
    isDirty(SHARING_PUBLIC_ACCESS_FORM_NAME)(state) ||
    isDirty(SHARING_MANAGEMENT_FORM_NAME)(state) ||
    isDirty(SHARING_INVITATION_FORM_NAME)(state);

const loadSharingDialog = async (dispatch: Dispatch, getState: () => RootState, { permissionService }: ServiceRepository) => {

    const dialog = getDialog<string>(getState().dialog, SHARING_DIALOG_NAME);

    if (dialog) {
        const { items } = await permissionService.listResourcePermissions(dialog.data);
        dispatch<any>(initializePublicAccessForm(items));
        await dispatch<any>(initializeManagementForm(items));
    }
};

const initializeManagementForm = (permissionLinks: PermissionResource[]) =>
    async (dispatch: Dispatch, getState: () => RootState, { userService }: ServiceRepository) => {

        const filters = new FilterBuilder()
            .addIn('uuid', permissionLinks.map(({ tailUuid }) => tailUuid))
            .getFilters();

        const { items: users } = await userService.list({ filters });

        const getEmail = (tailUuid: string) => {
            const user = users.find(({ uuid }) => uuid === tailUuid);
            return user
                ? user.email
                : tailUuid;
        };

        const managementPermissions = permissionLinks
            .filter(item =>
                item.tailUuid !== getPublicGroupUuid(getState()))
            .map(({ tailUuid, name, uuid }) => ({
                email: getEmail(tailUuid),
                permissions: name as PermissionLevel,
                permissionUuid: uuid,
            }));

        const managementFormData: SharingManagementFormData = {
            permissions: managementPermissions,
            initialPermissions: managementPermissions,
        };

        dispatch(initialize(SHARING_MANAGEMENT_FORM_NAME, managementFormData));
    };

const initializePublicAccessForm = (permissionLinks: PermissionResource[]) =>
    (dispatch: Dispatch, getState: () => RootState, ) => {

        const [publicPermission] = permissionLinks
            .filter(item => item.tailUuid === getPublicGroupUuid(getState()));

        const publicAccessFormData: SharingPublicAccessFormData = publicPermission
            ? {
                visibility: VisibilityLevel.PUBLIC,
                permissionUuid: publicPermission.uuid,
            }
            : {
                visibility: permissionLinks.length > 0
                    ? VisibilityLevel.SHARED
                    : VisibilityLevel.PRIVATE,
                permissionUuid: '',
            };

        dispatch(initialize(SHARING_PUBLIC_ACCESS_FORM_NAME, publicAccessFormData));
    };

const savePublicPermissionChanges = async (_: Dispatch, getState: () => RootState, { permissionService }: ServiceRepository) => {
    const state = getState();
    const { user } = state.auth;
    const dialog = getDialog<string>(state.dialog, SHARING_DIALOG_NAME);
    if (dialog && user) {
        const { permissionUuid, visibility } = getSharingPublicAccessFormData(state);

        if (permissionUuid) {
            if (visibility === VisibilityLevel.PUBLIC) {
                await permissionService.update(permissionUuid, {
                    name: PermissionLevel.CAN_READ
                });
            } else {
                await permissionService.delete(permissionUuid);
            }

        } else if (visibility === VisibilityLevel.PUBLIC) {

            await permissionService.create({
                ownerUuid: user.uuid,
                headUuid: dialog.data,
                tailUuid: getPublicGroupUuid(state),
                name: PermissionLevel.CAN_READ,
            });
        }
    }
};

const saveManagementChanges = async (_: Dispatch, getState: () => RootState, { permissionService }: ServiceRepository) => {
    const state = getState();
    const { user } = state.auth;
    const dialog = getDialog<string>(state.dialog, SHARING_DIALOG_NAME);
    if (dialog && user) {

        const { initialPermissions, permissions } = getSharingMangementFormData(state);
        const { visibility } = getSharingPublicAccessFormData(state);


        if (visibility === VisibilityLevel.PRIVATE) {

            await Promise.all(initialPermissions.map(({ permissionUuid, permissions }) =>
                permissionService.delete(permissionUuid)
            ));

        } else {

            const cancelledPermissions = differenceWith(
                initialPermissions,
                permissions,
                (a, b) => a.permissionUuid === b.permissionUuid
            );

            await Promise.all(cancelledPermissions.map(({ permissionUuid }) =>
                permissionService.delete(permissionUuid)
            ));

            await Promise.all(permissions.map(({ permissionUuid, permissions }) =>
                permissionService.update(permissionUuid, { name: permissions })
            ));
        }
    }
};

const sendInvitations = async (_: Dispatch, getState: () => RootState, { permissionService }: ServiceRepository) => {
    const state = getState();
    const { user } = state.auth;
    const dialog = getDialog<string>(state.dialog, SHARING_DIALOG_NAME);
    if (dialog && user) {

        const invitations = getFormValues(SHARING_INVITATION_FORM_NAME)(state) as SharingInvitationFormData;

        const promises = invitations.invitedPeople
            .map(person => ({
                ownerUuid: user.uuid,
                headUuid: dialog.data,
                tailUuid: person.uuid,
                name: invitations.permissions
            }))
            .map(data => permissionService.create(data));

        await Promise.all(promises);
    }
};
