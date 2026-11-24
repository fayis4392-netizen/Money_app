/** Public page Google needs before the Drive backup can be published (no sign-in required). */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Exchange Ledger: privacy policy</h1>
      <p className="mt-1 text-muted">Last updated 24 November 2026</p>
      <p className="mt-6">Exchange Ledger is an internal bookkeeping tool for one business. Only people given an account by the owner can sign in; there is no public sign-up.</p>
      <h2 className="mt-6 font-bold">What it stores</h2>
      <p className="mt-2">The business's own books: parties, deals, cash received, transfers, expenses and settings, plus the email address of each signed-in user. They are stored in the business's Supabase database and are not shared with anyone else.</p>
      <h2 className="mt-6 font-bold">Google Drive</h2>
      <p className="mt-2">If a user chooses to back up to Google Drive, the app asks Google for permission to create files in that user's Drive (scope <code>drive.file</code>). It uses this only to create a folder called "Exchange Ledger Backups" and save backup files of the books in it. It cannot see, read or change any other file in the Drive. Google user data is not sold, shared or used for anything else, and the permission can be removed at any time from the Google account's security settings (Third-party apps and services).</p>
      <h2 className="mt-6 font-bold">Contact</h2>
      <p className="mt-2">Questions: ask the business owner who gave you your account.</p>
    </main>
  )
}
