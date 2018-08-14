// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { GroupContentsResource } from "~/services/groups-service/groups-service";
import { ResourceKind } from "~/models/resource";

export interface ProjectPanelItem {
    uuid: string;
    name: string;
    description?: string;
    kind: string;
    url: string;
    owner: string;
    lastModified: string;
    fileSize?: number;
    status?: string;
}

export function resourceToDataItem(r: GroupContentsResource): ProjectPanelItem {
    return {
        uuid: r.uuid,
        name: r.name,
        description: r.description,
        kind: r.kind,
        url: "",
        owner: r.ownerUuid,
        lastModified: r.modifiedAt,
        status:  r.kind === ResourceKind.PROCESS ? r.state : undefined
    };
}
