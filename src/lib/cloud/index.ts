export { cloudMode } from './config';
export type { CloudMode } from './config';

export type { CloudUser } from './backend';
export { completeSignIn, signInWithGoogle, signOut, useAuth } from './auth';
export type { AuthState, AuthStatus } from './auth';
export { CALLBACK_PATH, DEFAULT_NEXT, safeNextPath } from './redirect';

export { CloudError, isCloudError, PROJECTS_PER_USER_MAX } from './errors';
export type { CloudErrorCode } from './errors';

export { fingerprintFile } from './fingerprint';

export {
  createSnapshot,
  normalizeTitle,
  parseSnapshot,
  planRestore,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_VERSION,
  TITLE_MAX_LENGTH,
} from './snapshot';
export type { CreateSnapshotInput, ProjectSnapshot, ProjectSummary, RestorePlan, SavedFile, SavedPage } from './snapshot';

export { clearPendingSave, hasPendingSave, readPendingSave, stashPendingSave, takePendingSave } from './pending';
export type { PendingSave, PendingSaveRead } from './pending';

export { deleteProject, getProject, isProjectId, listProjects, newProjectId, renameProject, saveProject } from './repository';
export type { ProjectRow, SaveProjectInput } from './repository';
