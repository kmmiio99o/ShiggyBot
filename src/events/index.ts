/**
 * Events barrel for ShiggyBot
 *
 * Re-exports the presence and autorole utilities so callers can import:
 *   import { startPresence, setupAutoRole } from './events';
 *
 * This file intentionally only re-exports named symbols so consumers don't
 * need to know individual event module paths.
 */

export { startPresence, setupPresence } from './presence';
export { setupAutoRole } from './autorole';
