# @scayle/h3-session

Persistent sessions for h3 with encryption and unstorage backends.

## Critical Constraints

- Session state is NOT automatically persisted. ALWAYS call `await session.save()` after mutations.
- `session.regenerate()` creates a new session ID and deletes the old one. Use for session fixation prevention after auth changes.
- `session.destroy()` sets maxAge=0 on the cookie and removes data from the store.
