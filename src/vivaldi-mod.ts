/**
 * Entry point for the Vivaldi mod build.
 *
 * Loaded into Vivaldi's UI (browser.html) as a plain <script>. The shim must
 * be imported first so the chrome.runtime references inside content.ts resolve
 * to no-ops instead of throwing in a non-extension context.
 */

import './vivaldi-shim';
import './content';
