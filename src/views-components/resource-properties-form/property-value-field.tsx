// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

import * as React from 'react';
import { change, WrappedFieldProps, WrappedFieldMetaProps, WrappedFieldInputProps, Field, formValues } from 'redux-form';
import { compose } from 'redux';
import { Autocomplete } from '~/components/autocomplete/autocomplete';
import { Vocabulary, getTagValueID, isStrictTag, getTagValues, PropFieldSuggestion } from '~/models/vocabulary';
import { PROPERTY_KEY_FIELD_ID } from '~/views-components/resource-properties-form/property-key-field';
import { VocabularyProp, connectVocabulary, buildProps } from '~/views-components/resource-properties-form/property-field-common';
import { TAG_VALUE_VALIDATION } from '~/validators/validators';
import { COLLECTION_TAG_FORM_NAME } from '~/store/collection-panel/collection-panel-action';
import { escapeRegExp } from '~/common/regexp.ts';

interface PropertyKeyProp {
    propertyKey: string;
}

export type PropertyValueFieldProps = VocabularyProp & PropertyKeyProp;

export const PROPERTY_VALUE_FIELD_NAME = 'value';
export const PROPERTY_VALUE_FIELD_ID = 'valueID';

export const PropertyValueField = compose(
    connectVocabulary,
    formValues({ propertyKey: PROPERTY_KEY_FIELD_ID })
)(
    (props: PropertyValueFieldProps) =>
        <Field
            name={PROPERTY_VALUE_FIELD_NAME}
            component={PropertyValueInput}
            validate={getValidation(props)}
            {...props} />
);

export const PropertyValueInput = ({ vocabulary, propertyKey, ...props }: WrappedFieldProps & PropertyValueFieldProps) =>
    <Autocomplete
        label='Value'
        suggestions={getSuggestions(props.input.value, propertyKey, vocabulary)}
        onSelect={handleSelect(props.input, props.meta)}
        {...buildProps(props)}
        onBlur={handleBlur(props.meta, props.input, vocabulary, propertyKey)}
    />;

const getValidation = (props: PropertyValueFieldProps) =>
    isStrictTag(props.propertyKey, props.vocabulary)
        ? [...TAG_VALUE_VALIDATION, matchTagValues(props)]
        : TAG_VALUE_VALIDATION;

const matchTagValues = ({ vocabulary, propertyKey }: PropertyValueFieldProps) =>
    (value: string) =>
        getTagValues(propertyKey, vocabulary).find(v => v.label === value)
            ? undefined
            : 'Incorrect value';

const getSuggestions = (value: string, tagName: string, vocabulary: Vocabulary) => {
    const re = new RegExp(escapeRegExp(value), "i");
    return getTagValues(tagName, vocabulary).filter(v => re.test(v.label) && v.label !== value);
};

// Attempts to match a manually typed value label with a value ID, when the user
// doesn't select the value from the suggestions list.
const handleBlur = (
    { dispatch }: WrappedFieldMetaProps,
    { onBlur, value }: WrappedFieldInputProps,
    vocabulary: Vocabulary,
    tagKeyID: string) =>
        () => {
            dispatch(change(COLLECTION_TAG_FORM_NAME, PROPERTY_VALUE_FIELD_ID, getTagValueID(tagKeyID, value, vocabulary)));
            onBlur(value);
        };

// When selecting a property value, save its ID for later usage.
const handleSelect = (
    { onChange }: WrappedFieldInputProps,
    { dispatch }: WrappedFieldMetaProps) => {
        return (item:PropFieldSuggestion) => {
            onChange(item.label);
            dispatch(change(COLLECTION_TAG_FORM_NAME, PROPERTY_VALUE_FIELD_ID, item.id));
    };
};
