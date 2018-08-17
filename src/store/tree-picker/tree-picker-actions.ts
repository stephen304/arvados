// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { default as unionize, ofType, UnionOf } from "unionize";

import { TreePickerNode } from "./tree-picker";

export const treePickerActions = unionize({
    LOAD_TREE_PICKER_NODE: ofType<{ id: string, pickerKind: string }>(),
    LOAD_TREE_PICKER_NODE_SUCCESS: ofType<{ id: string, nodes: Array<TreePickerNode>, pickerKind: string }>(),
    TOGGLE_TREE_PICKER_NODE_COLLAPSE: ofType<{ id: string, pickerKind: string }>(),
    TOGGLE_TREE_PICKER_NODE_SELECT: ofType<{ id: string, pickerKind: string }>()
}, {
        tag: 'type',
        value: 'payload'
    });

export type TreePickerAction = UnionOf<typeof treePickerActions>;
