// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import { default as unionize, ofType, UnionOf } from "unionize";

const actions = unionize({
    TOGGLE_SIDE_PANEL_ITEM_OPEN: ofType<string>(),
    TOGGLE_SIDE_PANEL_ITEM_ACTIVE: ofType<string>(),
}, {
    tag: 'type',
    value: 'payload'
});

export type SidePanelAction = UnionOf<typeof actions>;
export default actions;