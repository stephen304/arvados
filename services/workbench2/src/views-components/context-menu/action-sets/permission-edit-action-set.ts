// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { ContextMenuActionSet, ContextMenuActionNames } from 'views-components/context-menu/context-menu-action-set';
import { CanReadIcon, CanManageIcon, CanWriteIcon } from 'components/icon/icon';
import { editPermissionLevel } from 'store/group-details-panel/group-details-panel-actions';
import { PermissionLevel } from 'models/permission';

export const permissionEditActionSet: ContextMenuActionSet = [
    [
        {
            name: ContextMenuActionNames.READ,
            icon: CanReadIcon,
            execute: (dispatch, resources) => {
                resources.forEach((resource) => dispatch<any>(editPermissionLevel(resource.uuid, PermissionLevel.CAN_READ)));
            },
        },
        {
            name: ContextMenuActionNames.WRITE,
            icon: CanWriteIcon,
            execute: (dispatch, resources) => {
                resources.forEach((resource) => dispatch<any>(editPermissionLevel(resource.uuid, PermissionLevel.CAN_WRITE)));
            },
        },
        {
            name: ContextMenuActionNames.MANAGE,
            icon: CanManageIcon,
            execute: (dispatch, resources) => {
                resources.forEach((resource) => dispatch<any>(editPermissionLevel(resource.uuid, PermissionLevel.CAN_MANAGE)));
            },
        },
    ],
];
