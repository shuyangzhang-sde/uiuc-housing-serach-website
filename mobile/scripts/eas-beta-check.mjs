// EAS invokes this after installing dependencies, before native build work.
if (['preview', 'beta-store'].includes(process.env.EAS_BUILD_PROFILE)) {
  await import('./check-beta.mjs');
}
