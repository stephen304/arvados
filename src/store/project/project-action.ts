// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0
import { default as unionize, ofType, UnionOf } from "unionize";

import { ProjectResource } from "~/models/project";
import { Dispatch } from "redux";
import { FilterBuilder } from "~/common/api/filter-builder";
import { RootState } from "../store";
import { checkPresenceInFavorites } from "../favorites/favorites-actions";
import { ServiceRepository } from "~/services/services";
import { projectPanelActions } from "~/store/project-panel/project-panel-action";
import { updateDetails } from "~/store/details-panel/details-panel-action";

export const projectActions = unionize({
    OPEN_PROJECT_UPDATER: ofType<{ uuid: string}>(),
    CLOSE_PROJECT_UPDATER: ofType<{}>(),
    UPDATE_PROJECT_SUCCESS: ofType<ProjectResource>(),
    REMOVE_PROJECT: ofType<string>(),
    PROJECTS_REQUEST: ofType<string>(),
    PROJECTS_SUCCESS: ofType<{ projects: ProjectResource[], parentItemId?: string }>(),
    TOGGLE_PROJECT_TREE_ITEM_OPEN: ofType<string>(),
    TOGGLE_PROJECT_TREE_ITEM_ACTIVE: ofType<string>(),
    RESET_PROJECT_TREE_ACTIVITY: ofType<string>()
}, {
    tag: 'type',
    value: 'payload'
});

export const PROJECT_FORM_NAME = 'projectEditDialog';

export const getProjectList = (parentUuid: string = '') => 
    (dispatch: Dispatch, getState: () => RootState, services: ServiceRepository) => {
        dispatch(projectActions.PROJECTS_REQUEST(parentUuid));
        return services.projectService.list({
            filters: new FilterBuilder()
                .addEqual("ownerUuid", parentUuid)
                .getFilters()
        }).then(({ items: projects }) => {
            dispatch(projectActions.PROJECTS_SUCCESS({ projects, parentItemId: parentUuid }));
            dispatch<any>(checkPresenceInFavorites(projects.map(project => project.uuid)));
            return projects;
        });
    };

export const updateProject = (project: Partial<ProjectResource>) =>
    (dispatch: Dispatch, getState: () => RootState, services: ServiceRepository) => {
        const { uuid } = getState().projects.updater;
        return services.projectService
            .update(uuid, project)
            .then(project => {
                dispatch(projectActions.UPDATE_PROJECT_SUCCESS(project));
                dispatch(projectPanelActions.REQUEST_ITEMS());
                dispatch<any>(getProjectList(project.ownerUuid));
                dispatch<any>(updateDetails(project));
            });
    };

export type ProjectAction = UnionOf<typeof projectActions>;
