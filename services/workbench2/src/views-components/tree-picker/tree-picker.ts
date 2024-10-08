// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { connect } from "react-redux";
import { Tree as TreeComponent, TreeProps, TreeItem, TreeItemStatus } from "components/tree/tree";
import { RootState } from "store/store";
import { getNodeChildrenIds, Tree, createTree, getNode, TreeNodeStatus } from 'models/tree';
import { Dispatch } from "redux";
import { initTreeNode } from '../../models/tree';
import { ResourcesState } from "store/resources/resources";
import { Resource } from "models/resource";

type Callback<T> = (event: React.MouseEvent<HTMLElement>, item: TreeItem<T>, pickerId: string) => void;
export interface TreePickerProps<T> {
    pickerId: string;
    onContextMenu: Callback<T>;
    toggleItemOpen: Callback<T>;
    toggleItemActive: Callback<T>;
    toggleItemSelection: Callback<T>;
}

const flatTree = <T>(itemsIdMap: Map<string, TreeItem<T>>, depth: number, items?: TreeItem<T>[]): TreeItem<T>[] => {
    return items ? items
        .map((item: TreeItem<T>) => addToItemsIdMap(item, itemsIdMap))
        .reduce((acc: Array<TreeItem<T>>, next: TreeItem<T>) => {
            const { items } = next;
            acc.push({ ...next, depth });
            acc.push(...(next.open ? flatTree(itemsIdMap, depth + 1, items) : []));
            return acc;
        }, [] as TreeItem<T>[]) : [];
};

const addToItemsIdMap = <T>(item: TreeItem<T>, itemsIdMap: Map<string, TreeItem<T>>): TreeItem<T> => {
    itemsIdMap[item.id] = item;
    return item;
};

const mapStateToProps =
    <T>(state: RootState, props: TreePickerProps<T>): Pick<TreeProps<T>, 'items' | 'disableRipple' | 'itemsMap'> => {
        const itemsIdMap: Map<string, TreeItem<T>> = new Map();
        const tree: Tree<T> = state.treePicker[props.pickerId] || createTree<T>();
        return {
            disableRipple: true,
            items: getNodeChildrenIds('')(tree)
                .map(treePickerToTreeItems(tree, state.resources))
                .map(item => addToItemsIdMap(item, itemsIdMap))
                .map(parentItem => ({
                    ...parentItem,
                    flatTree: true,
                    items: flatTree(itemsIdMap, 2, parentItem.items || []),
                })),
            itemsMap: itemsIdMap,
        };
    };

const mapDispatchToProps = <T>(_: Dispatch, props: TreePickerProps<T>): Pick<TreeProps<T>, 'onContextMenu' | 'toggleItemOpen' | 'toggleItemActive' | 'toggleItemSelection'> => ({
    onContextMenu: (event, item) => props.onContextMenu(event, item, props.pickerId),
    toggleItemActive: (event, item) => props.toggleItemActive(event, item, props.pickerId),
    toggleItemOpen: (event, item) => props.toggleItemOpen(event, item, props.pickerId),
    toggleItemSelection: (event, item) => props.toggleItemSelection(event, item, props.pickerId),
});

export const TreePicker = connect(mapStateToProps, mapDispatchToProps)(TreeComponent);

const treePickerToTreeItems = <T>(tree: Tree<T>, resources: ResourcesState) =>
    (id: string): TreeItem<any> => {
        const node = getNode(id)(tree) || initTreeNode({ id: '', value: 'InvalidNode' });
        const items = getNodeChildrenIds(node.id)(tree)
            .map(treePickerToTreeItems(tree, resources));
        const resource = resources[node.id] as (Resource | undefined);

        return {
            active: node.active,
            data: resource
                ? {
                    ...resource,
                    name: typeof node.value === "string"
                        ? node.value
                        : typeof (node.value as any).name === "string"
                        ? (node.value as any).name
                        : "",
                    weight: (node.value as any).weight
                }
                : node.value,
            id: node.id,
            items: items.length > 0 ? items : undefined,
            open: node.expanded,
            selected: node.selected,
            status: treeNodeStatusToTreeItem(node.status),
        };
    };

export const treeNodeStatusToTreeItem = (status: TreeNodeStatus) => {
    switch (status) {
        case TreeNodeStatus.INITIAL:
            return TreeItemStatus.INITIAL;
        case TreeNodeStatus.PENDING:
            return TreeItemStatus.PENDING;
        case TreeNodeStatus.LOADED:
            return TreeItemStatus.LOADED;
    }
};
