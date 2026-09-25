/** The feedback flow is the only login redirect accepted from a URL parameter. */
export function getAllowedLoginReturnPath(search: string): '/feedback' | null {
  const params = new URLSearchParams(search);
  return params.get('return') === '/feedback' ? '/feedback' : null;
}
