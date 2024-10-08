// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { ResourceKind } from "models/resource";
import { ContextMenuKind } from "views-components/context-menu/menu-item-sort"
import { MultiSelectMenuActionSet} from "views-components/multiselect-toolbar/ms-menu-actions";
import { msCollectionActionSet } from "views-components/multiselect-toolbar/ms-collection-action-set";
import { msProjectActionSet } from "views-components/multiselect-toolbar/ms-project-action-set";
import { msProcessActionSet } from "views-components/multiselect-toolbar/ms-process-action-set";
import { msWorkflowActionSet } from "views-components/multiselect-toolbar/ms-workflow-action-set";
import { msGroupActionSet } from "views-components/multiselect-toolbar/ms-group-action-set";
import { UserDetailsActionSet } from "views-components/multiselect-toolbar/ms-user-details-action-set";

export function findActionByName(name: string, actionSet: MultiSelectMenuActionSet) {
    return actionSet[0].find(action => action.name === name);
}

const { COLLECTION, PROCESS, PROJECT, WORKFLOW, USER } = ResourceKind;
const { GROUPS } = ContextMenuKind;

export const kindToActionSet: Record<string, MultiSelectMenuActionSet> = {
    [COLLECTION]: msCollectionActionSet,
    [PROCESS]: msProcessActionSet,
    [PROJECT]: msProjectActionSet,
    [WORKFLOW]: msWorkflowActionSet,
    [USER]: UserDetailsActionSet,
    [GROUPS]: msGroupActionSet,
};
