# Changes

- Managed CLI and Mac app installs use Homebrew's stable Node link when available. Desktop shows a repair command when its runtime cannot start, and the installer can reclaim abandoned app-update locks when ownership is verifiable.
- Shared note links offer **Connect** when a browser needs an access key. Entering a valid key opens the original note.
- Browsers now stay signed in to a shared brain for as long as browsers allow: the session lasts 400 days and renews whenever you use it, and the cookie no longer contains your access key. Admins can copy a one-click **Invite link** for each key under Access keys (single use, valid 7 days), see which browsers are signed in, and sign one or all of them out; revoking a key still signs it out everywhere at once. Readers see who they are signed in as, a **Sign out** button and **View only** on notes. After updating the server, browsers signed in with the old 24-hour cookie switch over on their next visit.
