// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import React from 'react';
import { CustomStyleRulesCallback } from 'common/custom-theme';
import { WithStyles } from '@mui/styles';
import withStyles from '@mui/styles/withStyles';
import { ArvadosTheme } from '../../common/custom-theme';
import { Typography } from '@mui/material';
import { IconType } from '../icon/icon';
import classnames from "classnames";

type CssRules = 'root' | 'icon' | 'message';

const styles: CustomStyleRulesCallback<CssRules> = (theme: ArvadosTheme) => ({
    root: {
        textAlign: 'center'
    },
    icon: {
        color: theme.palette.grey["500"],
        fontSize: '4.5rem'
    },
    message: {
        color: theme.palette.grey["500"]
    }
});

export interface DefaultViewDataProps {
    classRoot?: string;
    messages: string[];
    filtersApplied?: boolean;
    classMessage?: string;
    icon?: IconType;
    classIcon?: string;
}

type DefaultViewProps = DefaultViewDataProps & WithStyles<CssRules>;

export const DefaultView = withStyles(styles)(
    ({ classes, classRoot, messages, classMessage, icon: Icon, classIcon }: DefaultViewProps) =>
        <Typography className={classnames([classes.root, classRoot])} component="div">
            {Icon && <Icon className={classnames([classes.icon, classIcon])} />}
            {messages.map((msg: string, index: number) => {
                return <Typography key={index}
                    data-cy='default-view'
                    className={classnames([classes.message, classMessage])}>{msg}</Typography>;
            })}
        </Typography>
);
