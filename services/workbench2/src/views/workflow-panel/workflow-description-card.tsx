// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import React from 'react';
import { CustomStyleRulesCallback } from 'common/custom-theme';
import { CardContent, Tab, Tabs, Table, TableHead, TableCell, TableBody, TableRow, Typography } from '@mui/material';
import { WithStyles } from '@mui/styles';
import withStyles from '@mui/styles/withStyles';
import { ArvadosTheme } from 'common/custom-theme';
import { WorkflowIcon } from 'components/icon/icon';
import { DataTableDefaultView } from 'components/data-table-default-view/data-table-default-view';
import { parseWorkflowDefinition, getWorkflowInputs, getInputLabel, stringifyInputType } from 'models/workflow';
import { WorkflowDetailsCardDataProps, WorkflowDetailsAttributes } from 'views-components/details-panel/workflow-details';

export type CssRules = 'root' | 'tab' | 'inputTab' | 'graphTab' | 'graphTabWithChosenWorkflow' | 'descriptionTab' | 'inputsTable' | 'workflowName';

const styles: CustomStyleRulesCallback<CssRules> = (theme: ArvadosTheme) => ({
    root: {
        height: '100%'
    },
    tab: {
        minWidth: '33%'
    },
    inputTab: {
        overflow: 'auto',
        height: "50vh",
        marginTop: theme.spacing(1)
    },
    graphTab: {
        marginTop: theme.spacing(1),
    },
    graphTabWithChosenWorkflow: {
        overflow: 'auto',
        height: '450px',
        marginTop: theme.spacing(1),
    },
    descriptionTab: {
        overflow: 'auto',
        height: "50vh",
        marginTop: theme.spacing(1),
    },
    inputsTable: {
        tableLayout: 'fixed',
    },
    workflowName: {
        minHeight: "4rem",
    }
});

type WorkflowDetailsCardProps = WorkflowDetailsCardDataProps & WithStyles<CssRules>;

export const WorkflowDetailsCard = withStyles(styles)(
    class extends React.Component<WorkflowDetailsCardProps> {
        state = {
            value: 0,
        };

        handleChange = (event: React.MouseEvent<HTMLElement>, value: number) => {
            this.setState({ value });
        }

        render() {
            const { classes, workflow } = this.props;
            const { value } = this.state;
            return <div className={classes.root}>
                <Typography className={classes.workflowName} variant='h6'>
                    {workflow && workflow.name}
                </Typography>
                <Tabs value={value} onChange={this.handleChange} centered={true}>
                    <Tab className={classes.tab} label="Description" />
                    <Tab className={classes.tab} label="Inputs" />
                    <Tab className={classes.tab} label="Details" />
                </Tabs>
                {value === 0 && <CardContent className={classes.descriptionTab}>
                    {workflow ? <div dangerouslySetInnerHTML={{ __html: workflow.description || '(no-description)' }}></div> : (
                        <DataTableDefaultView
                            icon={WorkflowIcon}
                            messages={['Please select a workflow to see its description.']} />
                    )}
                </CardContent>}
                {value === 1 && <CardContent className={classes.inputTab}>
                    {workflow
                    ? this.renderInputsTable()
                    : <DataTableDefaultView
                          icon={WorkflowIcon}
                          messages={['Please select a workflow to see its inputs.']} />
                    }
                </CardContent>}
                {value === 2 && <CardContent className={classes.descriptionTab}>
                    {workflow
                    ? <WorkflowDetailsAttributes workflow={workflow} />
                    : <DataTableDefaultView
                          icon={WorkflowIcon}
                          messages={['Please select a workflow to see its details.']} />
                    }
                </CardContent>}
            </div>;
        }

        get inputs() {
            if (this.props.workflow) {
                const definition = parseWorkflowDefinition(this.props.workflow);
                if (definition) {
                    return getWorkflowInputs(definition);
                }
            }
            return undefined;
        }

        renderInputsTable() {
            return <Table className={this.props.classes.inputsTable}>
                <TableHead>
                    <TableRow>
                        <TableCell>Label</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Description</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {this.inputs && this.inputs.map(input =>
                        <TableRow key={input.id}>
                            <TableCell>{getInputLabel(input)}</TableCell>
                            <TableCell>{stringifyInputType(input)}</TableCell>
                            <TableCell>{input.doc}</TableCell>
                        </TableRow>)}
                </TableBody>
            </Table>;
        }
    });
