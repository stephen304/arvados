// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import * as React from 'react';
import { connect, DispatchProp } from 'react-redux';
import Typography from '@material-ui/core/Typography';
import { StyleRulesCallback, WithStyles, withStyles } from '@material-ui/core/styles';
import { Tooltip } from '@material-ui/core';
import { CopyIcon } from '~/components/icon/icon';
import * as CopyToClipboard from 'react-copy-to-clipboard';
import { ArvadosTheme } from '~/common/custom-theme';
import * as classnames from "classnames";
import { Link } from 'react-router-dom';
import { RootState } from "~/store/store";
import { FederationConfig, getNavUrl } from "~/routes/routes";
import { snackbarActions, SnackbarKind } from '~/store/snackbar/snackbar-actions';

type CssRules = 'attribute' | 'label' | 'value' | 'lowercaseValue' | 'link' | 'copyIcon';

const styles: StyleRulesCallback<CssRules> = (theme: ArvadosTheme) => ({
    attribute: {
        display: 'flex',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.unit
    },
    label: {
        boxSizing: 'border-box',
        color: theme.palette.grey["500"],
        width: '40%'
    },
    value: {
        boxSizing: 'border-box',
        width: '60%',
        alignItems: 'flex-start'
    },
    lowercaseValue: {
        textTransform: 'lowercase'
    },
    link: {
        width: '60%',
        color: theme.palette.primary.main,
        textDecoration: 'none',
        overflowWrap: 'break-word',
        cursor: 'pointer'
    },
    copyIcon: {
        marginLeft: theme.spacing.unit,
        fontSize: '1.125rem',
        color: theme.palette.grey["500"],
        cursor: 'pointer'
    }
});

interface DetailsAttributeDataProps {
    label: string;
    classLabel?: string;
    value?: React.ReactNode;
    classValue?: string;
    lowercaseValue?: boolean;
    link?: string;
    children?: React.ReactNode;
    onValueClick?: () => void;
    linkToUuid?: string;
}

type DetailsAttributeProps = DetailsAttributeDataProps & WithStyles<CssRules> & FederationConfig & DispatchProp;

const mapStateToProps = ({ auth }: RootState): FederationConfig => ({
    localCluster: auth.localCluster,
    remoteHostsConfig: auth.remoteHostsConfig,
    sessions: auth.sessions
});

export const DetailsAttribute = connect(mapStateToProps)(withStyles(styles)(
    class extends React.Component<DetailsAttributeProps> {

        onCopy = (message: string) => {
            this.props.dispatch(snackbarActions.OPEN_SNACKBAR({
                message,
                hideDuration: 2000,
                kind: SnackbarKind.SUCCESS
            }));
        }

        render() {
            const { label, link, value, children, classes, classLabel,
                classValue, lowercaseValue, onValueClick, linkToUuid,
                localCluster, remoteHostsConfig, sessions } = this.props;
            let valueNode: React.ReactNode;

            if (linkToUuid) {
                const linkUrl = getNavUrl(linkToUuid || "", { localCluster, remoteHostsConfig, sessions });
                if (linkUrl[0] === '/') {
                    valueNode = <Link to={linkUrl} className={classes.link}>{linkToUuid}</Link>;
                } else {
                    valueNode = <a href={linkUrl} className={classes.link} target='_blank'>{linkToUuid}</a>;
                }
            } else if (link) {
                valueNode = <a href={link} className={classes.link} target='_blank'>{value}</a>;
            } else {
                valueNode = value;
            }
            return <Typography component="div" className={classes.attribute}>
                <Typography component="span" className={classnames([classes.label, classLabel])}>{label}</Typography>
                <Typography
                    onClick={onValueClick}
                    component="span"
                    className={classnames([classes.value, classValue, { [classes.lowercaseValue]: lowercaseValue }])}>
                    {valueNode}
                    {children}
                    {linkToUuid && <Tooltip title="Copy">
                        <CopyToClipboard text={linkToUuid || ""} onCopy={() => this.onCopy("Copied")}>
                            <CopyIcon className={classes.copyIcon} />
                        </CopyToClipboard>
                    </Tooltip>}
                </Typography>
            </Typography>;
        }
    }
));
