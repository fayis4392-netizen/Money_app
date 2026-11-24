import { backupToDrive } from '@/lib/drive'
import { supabase } from '@/lib/supabase'
import { getState, setState } from './store'

/** Back the books up to Google Drive and note when (shared, so everyone sees the last backup). */
export async function backUpToDrive() {
  const r = await backupToDrive(getState())
  const by = supabase ? (await supabase.auth.getSession()).data.session?.user.email : undefined
  setState((s) => ({ ...s, settings: { ...s.settings, lastDriveBackup: { at: new Date().toISOString(), by, fileName: r.fileName, folderUrl: r.folderUrl } } }))
  return r
}

/** True when there's been no Drive backup in the last day. */
export const driveBackupDue = () => {
  const last = getState().settings.lastDriveBackup?.at
  return !last || Date.now() - new Date(last).getTime() > 24 * 3600 * 1000
}
