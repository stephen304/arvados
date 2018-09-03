// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import * as React from 'react';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { CodeSnippet, CodeSnippetDataProps } from '~/components/code-snippet/code-snippet';
import grey from '@material-ui/core/colors/grey';

const theme = createMuiTheme({
    overrides: {
        MuiTypography: {
            body1: {
                color: grey["200"]
            },
            root: {
                backgroundColor: '#000'
            }
        }
    },
    typography: {
        fontFamily: 'monospace'
    }
});

type ProcessLogCodeSnippet = CodeSnippetDataProps;

export const ProcessLogCodeSnippet = (props: ProcessLogCodeSnippet) => 
    <MuiThemeProvider theme={theme}>
        <CodeSnippet lines={props.lines} />
    </MuiThemeProvider>;