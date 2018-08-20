// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { projectsReducer, getTreePath } from "./project-reducer";
import { projectActions } from "./project-action";
import { TreeItem, TreeItemStatus } from "~/components/tree/tree";
import { mockProjectResource } from "~/models/test-utils";

describe('project-reducer', () => {

    it('should load projects', () => {
        const initialState = undefined;

        const projects = [mockProjectResource({ uuid: "1" }), mockProjectResource({ uuid: "2" })];
        const state = projectsReducer(initialState, projectActions.PROJECTS_SUCCESS({ projects, parentItemId: undefined }));
        expect(state).toEqual({
            items: [{
                active: false,
                open: false,
                id: "1",
                items: [],
                data: mockProjectResource({ uuid: "1" }),
                status: TreeItemStatus.INITIAL
            }, {
                active: false,
                open: false,
                id: "2",
                items: [],
                data: mockProjectResource({ uuid: "2" }),
                status: TreeItemStatus.INITIAL
            }
            ],
            currentItemId: "",
            creator: {
                opened: false,
                ownerUuid: "",
            },
            updater: {
                opened: false,
                uuid: ''
            }
        });
    });

    it('should remove activity on projects list', () => {
        const initialState = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: true,
                active: true,
                status: TreeItemStatus.PENDING
            }],
            currentItemId: "1",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }
        };
        const project = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: true,
                active: false,
                status: TreeItemStatus.PENDING
            }],
            currentItemId: "",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }
        };

        const state = projectsReducer(initialState, projectActions.RESET_PROJECT_TREE_ACTIVITY(initialState.items[0].id));
        expect(state).toEqual(project);
    });

    it('should toggle project tree item activity', () => {
        const initialState = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: true,
                active: false,
                status: TreeItemStatus.PENDING
            }],
            currentItemId: "1",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }
        };
        const project = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: true,
                active: true,
                status: TreeItemStatus.PENDING,
            }],
            currentItemId: "1",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }
        };

        const state = projectsReducer(initialState, projectActions.TOGGLE_PROJECT_TREE_ITEM_ACTIVE(initialState.items[0].id));
        expect(state).toEqual(project);
    });


    it('should close project tree item ', () => {
        const initialState = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: true,
                active: false,
                status: TreeItemStatus.PENDING,
            }],
            currentItemId: "1",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }
        };
        const project = {
            items: [{
                data: mockProjectResource(),
                id: "1",
                open: false,
                active: false,
                status: TreeItemStatus.PENDING,
            }],
            currentItemId: "1",
            creator: { opened: false, ownerUuid: "" },
            updater: { opened: false, uuid: '' }

        };

        const state = projectsReducer(initialState, projectActions.TOGGLE_PROJECT_TREE_ITEM_OPEN(initialState.items[0].id));
        expect(state).toEqual(project);
    });
});

describe("findTreeBranch", () => {
    const createTreeItem = (id: string, items?: Array<TreeItem<string>>): TreeItem<string> => ({
        id,
        items,
        active: false,
        data: "",
        open: false,
        status: TreeItemStatus.INITIAL
    });

    it("should return an array that matches path to the given item", () => {
        const tree: Array<TreeItem<string>> = [
            createTreeItem("1", [
                createTreeItem("1.1", [
                    createTreeItem("1.1.1"),
                    createTreeItem("1.1.2")
                ])
            ]),
            createTreeItem("2", [
                createTreeItem("2.1", [
                    createTreeItem("2.1.1"),
                    createTreeItem("2.1.2")
                ])
            ])
        ];
        const branch = getTreePath(tree, "2.1.1");
        expect(branch.map(item => item.id)).toEqual(["2", "2.1", "2.1.1"]);
    });

    it("should return empty array if item is not found", () => {
        const tree: Array<TreeItem<string>> = [
            createTreeItem("1", [
                createTreeItem("1.1", [
                    createTreeItem("1.1.1"),
                    createTreeItem("1.1.2")
                ])
            ]),
            createTreeItem("2", [
                createTreeItem("2.1", [
                    createTreeItem("2.1.1"),
                    createTreeItem("2.1.2")
                ])
            ])
        ];
        expect(getTreePath(tree, "3")).toHaveLength(0);
    });

});
