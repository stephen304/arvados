// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import * as React from 'react';
import { connect, DispatchProp } from 'react-redux';
import { Grid, Typography, Button, Select } from '@material-ui/core';
import { StyleRulesCallback, WithStyles, withStyles } from '@material-ui/core/styles';
import { login, authActions } from '~/store/auth/auth-action';
import { ArvadosTheme } from '~/common/custom-theme';
import { RootState } from '~/store/store';
import { LoginForm } from '~/views-components/login-form/login-form';
import Axios from 'axios';

type CssRules = 'root' | 'container' | 'title' | 'content' | 'content__bolder' | 'button';

const styles: StyleRulesCallback<CssRules> = (theme: ArvadosTheme) => ({
    root: {
        position: 'relative',
        backgroundColor: theme.palette.grey["200"],
        '&::after': {
            content: `''`,
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            opacity: 0.2,
        }
    },
    container: {
        width: '560px',
        zIndex: 10
    },
    title: {
        marginBottom: theme.spacing.unit * 6,
        color: theme.palette.grey["800"]
    },
    content: {
        marginBottom: theme.spacing.unit * 3,
        lineHeight: '1.2rem',
        color: theme.palette.grey["800"]
    },
    'content__bolder': {
        fontWeight: 'bolder'
    },
    button: {
        boxShadow: 'none'
    }
});

const doPAMLogin = (url: string) => (username: string, password: string) => {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);
    return Axios.post(`${url}/login`, formData, {
        headers: { 'X-Http-Method-Override': 'GET' },
    });
};

type LoginPanelProps = DispatchProp<any> & WithStyles<CssRules> & {
    remoteHosts: { [key: string]: string },
    homeCluster: string,
    uuidPrefix: string,
    loginCluster: string,
    welcomePage: string,
    pamLogin: boolean,
};

export const LoginPanel = withStyles(styles)(
    connect((state: RootState) => ({
        remoteHosts: state.auth.remoteHosts,
        homeCluster: state.auth.homeCluster,
        uuidPrefix: state.auth.localCluster,
        loginCluster: state.auth.loginCluster,
        welcomePage: state.auth.config.clusterConfig.Workbench.WelcomePageHTML,
        pamLogin: state.auth.config.clusterConfig.Login.PAM,
    }))(({ classes, dispatch, remoteHosts, homeCluster, uuidPrefix, loginCluster, welcomePage, pamLogin }: LoginPanelProps) =>
        <Grid container justify="center" alignItems="center"
            className={classes.root}
            style={{ marginTop: 56, overflowY: "auto", height: "100%" }}>
            <Grid item className={classes.container}>
                <Typography component="div">
                    <div dangerouslySetInnerHTML={{ __html: welcomePage }} style={{ margin: "1em" }} />
                </Typography>
                {Object.keys(remoteHosts).length > 1 && loginCluster === "" &&

                    <Typography component="div" align="right">
                        <label>Please select the cluster that hosts your user account:</label>
                        <Select native value={homeCluster} style={{ margin: "1em" }}
                            onChange={(event) => dispatch(authActions.SET_HOME_CLUSTER(event.target.value))}>
                            {Object.keys(remoteHosts).map((k) => <option key={k} value={k}>{k}</option>)}
                        </Select>
                    </Typography>}

                {pamLogin
                ? <Typography component="div">
                    <LoginForm dispatch={dispatch} handleSubmit={
                        doPAMLogin(`https://${remoteHosts[homeCluster]}`)}/>
                </Typography>
                : <Typography component="div" align="right">
                    <Button variant="contained" color="primary" style={{ margin: "1em" }}
                        className={classes.button}
                        onClick={() => dispatch(login(uuidPrefix, homeCluster, loginCluster, remoteHosts))}>
                        Log in {uuidPrefix !== homeCluster && loginCluster !== homeCluster &&
                            <span>&nbsp;to {uuidPrefix} with user from {homeCluster}</span>}
                    </Button>
                </Typography>}
            </Grid>
        </Grid >
    ));
