import { gql } from '@apollo/client';

export const PUBLIC_FORM_QUERY = gql`
  query PublicForm($token: String!) {
    formByLink(token: $token) {
      id
      name
      fields {
        id
        fieldKey
        label
        type
        required
        options
        sortOrder
        helpText
      }
    }
  }
`;

export const PREPARE_FORM_UPLOAD_MUTATION = gql`
  mutation PrepareFormUpload($input: PrepareFormUploadInput!) {
    prepareFormFileUpload(input: $input) {
      storageKey
      url
      method
      expiresAt
      headers {
        name
        value
      }
    }
  }
`;

export const SUBMIT_FORM_MUTATION = gql`
  mutation SubmitForm($input: SubmitFormInput!) {
    submitForm(input: $input) {
      id
      submittedAt
    }
  }
`;
