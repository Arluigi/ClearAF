# Care Journal — first iPhone pass

Scope: Today, Photos, Routines and their shared content foundations, guided by [the approved design language](design-language.md). Portal styling/workspace navigation and authentication/profile/capture-screen redesign remain a separate pass. The existing physical demo is not replaced by this Simulator verification.

Implemented semantic adaptive colors and system serif editorial headings without changing legacy feature colors globally. Today and photo-list reading surfaces use restrained 12-point corners without shadows. The native TabView is retained. Photos Grid/List and Routines Morning/Evening share a native segmented Picker wrapper; accessibility text sizes use the same native menu adaptation. Photos paging/capture move into the content scroll at accessibility sizes so a persistent footer cannot obscure most of the screen. Routine version and refresh metadata remain available under details, with saved/error/pending state still visible when relevant.

No API, database, sharing, pagination-store, completion-repository or account behavior changes. No new clinical guidance or feature was introduced. The original guide is committed unchanged.

## Verification

Release Simulator build passed. Eleven focused AccountProfileTests passed, including both action foreground/background pairings and the new reading/action colors against canvas and surface in light/dark appearances. Native UI selection/navigation and screenshots were checked using the retained synthetic demo account. Simulator photo history is device-local and empty; existing hosted routine/completion data supplies the populated routine state. No clinical photos or private credentials are committed.

The initial unsigned Simulator verification failed at sign-in; rebuilding with normal Simulator signing resolved it. An initial dark-mode launch argument did not change the rendered appearance; those mislabeled images are not dark-mode evidence. A screenshot review found excessive large-text footer height; actions now scroll with content at those sizes.

The final focused UI run passed in 50.3 seconds with actual system dark appearance: tab navigation and Grid/List and Morning/Evening selections passed, and six standard/largest-text screenshots were captured. Visual inspection confirmed the dark palette and that large-text Photos content scrolls without the former fixed footer obstruction. The earlier light screenshots cover the same semantic styles before the footer adjustment. Disabled routine completion retains the separate “Recorded today” explanation; the native disabled button itself is subdued. Simulator rendering is not a claim of physical-device material fidelity. Reduce Transparency, Increase Contrast, Reduce Motion and VoiceOver were not separately audited in this bounded pass; navigation and selection use native controls without custom material/animation overrides. No full backend/device matrix was rerun locally.
