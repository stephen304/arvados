// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import React from "react";
import { MenuItem, Typography } from "@mui/material";
import { DropdownMenu } from "components/dropdown-menu/dropdown-menu";
import { ImportContactsIcon, HelpIcon } from "components/icon/icon";
import { ArvadosTheme } from 'common/custom-theme';
import { CustomStyleRulesCallback } from 'common/custom-theme';
import { WithStyles } from '@mui/styles';
import withStyles from '@mui/styles/withStyles';
import { RootState } from "store/store";
import { compose } from "redux";
import { connect } from "react-redux";

type CssRules = 'link' | 'icon' | 'title' | 'linkTitle';

const styles: CustomStyleRulesCallback<CssRules> = (theme: ArvadosTheme) => ({
    link: {
        textDecoration: 'none',
        color: 'inherit',
        width: '100%',
        display: 'flex'
    },
    icon: {
        width: '16px',
        height: '16px'
    },
    title: {
        paddingBottom: theme.spacing(0.5),
        paddingLeft: theme.spacing(2),
        paddingTop: theme.spacing(0.5),
        outline: 'none',
    },
    linkTitle: {
        marginLeft: theme.spacing(1)
    },
});

const links = [
    {
        title: "Tutorials and User guide",
        link: "http://doc.arvados.org/user/",
    },
    {
        title: "API Reference",
        link: "http://doc.arvados.org/api/",
    },
    {
        title: "SDK Reference",
        link: "http://doc.arvados.org/sdk/"
    },
];

interface HelpMenuProps {
    currentRoute: string;
}

const mapStateToProps = ({ router }: RootState) => ({
    currentRoute: router.location ? router.location.pathname : '',
});

export const HelpMenu = compose(
    connect(mapStateToProps),
    withStyles(styles))(
        ({ classes, currentRoute }: HelpMenuProps & WithStyles<CssRules>) =>
            <DropdownMenu
                icon={<HelpIcon />}
                id="help-menu"
                title="Help"
                key={currentRoute}>
                <MenuItem disabled>Help</MenuItem>
                {
                    links.map(link =>
                        <MenuItem key={link.title}>
                            <a href={link.link} target="_blank" rel="noopener noreferrer" className={classes.link}>
                                <ImportContactsIcon className={classes.icon} />
                                <Typography className={classes.linkTitle}>{link.title}</Typography>
                            </a>
                        </MenuItem>
                    )
                }
            </DropdownMenu>
    );
