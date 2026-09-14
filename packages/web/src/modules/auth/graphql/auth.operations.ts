import { gql } from '@apollo/client';

const AUTH_PAYLOAD = `
  token
  user {
    id
    email
    organizationId
    status
    employeeId
    roleKeys
    portal
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      ${AUTH_PAYLOAD}
      workspaceSelectionToken
      workspaces {
        organizationId
        organizationName
      }
    }
  }
`;

export const SELECT_WORKSPACE_MUTATION = gql`
  mutation SelectWorkspace($input: SelectWorkspaceInput!) {
    selectWorkspace(input: $input) {
      ${AUTH_PAYLOAD}
    }
  }
`;

export const HAS_OTHER_WORKSPACES_QUERY = gql`
  query HasOtherWorkspaces {
    hasOtherWorkspaces
  }
`;

export const SWITCHABLE_WORKSPACES_QUERY = gql`
  query SwitchableWorkspaces {
    switchableWorkspaces {
      organizationId
      organizationName
    }
  }
`;

export const SWITCH_WORKSPACE_MUTATION = gql`
  mutation SwitchWorkspace($organizationId: ID!) {
    switchWorkspace(organizationId: $organizationId) {
      ${AUTH_PAYLOAD}
    }
  }
`;

export const SIGN_UP_MUTATION = gql`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      ${AUTH_PAYLOAD}
    }
  }
`;

export const LEGAL_NAME_IS_ALREADY_USED_QUERY = gql`
  query LegalNameIsAlreadyUsed($legalName: String!) {
    legalNameIsAlreadyUsed(legalName: $legalName)
  }
`;

export const HAS_CREATED_WORKSPACE_QUERY = gql`
  query HasCreatedWorkspace($email: String!) {
    hasCreatedWorkspace(email: $email)
  }
`;

export const WORKSPACE_USERS_QUERY = gql`
  query WorkspaceUsers {
    workspaceUsers {
      id
      email
      organizationId
      status
      employeeId
      roleKeys
      portal
    }
  }
`;

export const ASSIGNABLE_WORKSPACE_ROLES_QUERY = gql`
  query AssignableWorkspaceRoles {
    assignableWorkspaceRoles
  }
`;

export const CREATE_WORKSPACE_USER_MUTATION = gql`
  mutation CreateWorkspaceUser($input: CreateWorkspaceUserInput!) {
    createWorkspaceUser(input: $input) {
      id
      email
      organizationId
      status
      employeeId
      roleKeys
      portal
    }
  }
`;

export const UPDATE_WORKSPACE_USER_ROLE_MUTATION = gql`
  mutation UpdateWorkspaceUserRole($input: UpdateWorkspaceUserRoleInput!) {
    updateWorkspaceUserRole(input: $input) {
      id
      email
      organizationId
      status
      employeeId
      roleKeys
      portal
    }
  }
`;
