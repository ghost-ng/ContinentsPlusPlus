// Module-resolution hooks for the headless map-gen harness.
// Maps the game's absolute import specifiers onto the Steam install, and
// redirects game-only modules (start positions, discoveries, features) to
// stubs so the mod script can load without the engine.
// Usage: node --import ./harness/register.mjs harness/run.mjs [args]
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const GAME_MODULES = 'C:/Program Files (x86)/Steam/steamapps/common/Sid Meier\'s Civilization VII/Base/modules';
if (!existsSync(GAME_MODULES)) {
  throw new Error(`Civ VII install not found at ${GAME_MODULES} — edit harness/register.mjs`);
}

const stubbed = [
  '/base-standard/scripts/common-generation.js',
  '/base-standard/maps/assign-starting-plots.js',
  '/base-standard/maps/discovery-generator.js',
  '/base-standard/maps/assign-advanced-start-region.js',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubbed.includes(specifier)) {
      return { url: new URL('./stubs.mjs', import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith('/base-standard/') || specifier.startsWith('/core/')) {
      return { url: pathToFileURL(GAME_MODULES + specifier).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
