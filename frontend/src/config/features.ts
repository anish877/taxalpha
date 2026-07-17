/**
 * The guided workspace is intentionally a presentation-only feature flag.
 * Set VITE_GUIDED_CLIENT_WORKSPACE=false to return to the previous catalog UI
 * without changing data, routes, or backend behavior.
 */
const guidedWorkspaceSetting = import.meta.env.VITE_GUIDED_CLIENT_WORKSPACE;

export const GUIDED_CLIENT_WORKSPACE = guidedWorkspaceSetting
  ? guidedWorkspaceSetting !== 'false'
  : import.meta.env.MODE !== 'test';
