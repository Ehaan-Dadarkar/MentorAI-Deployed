// Event name for an expired session (Frontend M7). Defined in its own
// import-free module so both the axios interceptor (which cannot import
// the auth store without creating an axios <-> authStore cycle) and the
// App listener can share it.
export const SESSION_EXPIRED_EVENT = "mentorai:session-expired";
