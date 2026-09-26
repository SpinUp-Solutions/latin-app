/** Enable attestation only after every web client has a configured site key. */
export function shouldEnforceAIAppCheck(environment: NodeJS.ProcessEnv = process.env): boolean {
  return (
    environment.AI_ENFORCE_APP_CHECK === 'true' &&
    environment.FUNCTIONS_EMULATOR !== 'true' &&
    environment.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true'
  );
}
