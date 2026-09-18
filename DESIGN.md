# APEX / UNKNOWN visual system

User-directed replacement: bright, friendly kart racing. Original Three.js environment and vehicles. Preserve the immersive single-screen race with a separate results tab.

## Scene
Sunny sky (#91dcf1), turquoise water, soft grass, sandy island edge, slate-blue tarmac, coral and cream curbs. Rounded trees, flowers, colourful pit garages, puffy clouds, hot-air balloons and a cheerful starting arch. Rounded karts with small helmeted drivers and visible steering wheels. Five persistent driver colours: coral, violet, blue, yellow, teal.

## Camera and interaction
Default view behind ATLAS, the rear starter, with opponents ahead. Low perspective chase camera follows position and heading with frame-rate-independent damping, slight speed-based field-of-view expansion and a stabilized look target. Disable extra body bob, balloon motion and speed effects for reduced-motion users. Five helmet buttons switch the followed driver and activate chase view. Keys 1–5 select a pilot; C cycles camera modes. Keep orbit and overhead views. Hide opponent labels near the camera to avoid occluding the track.

## UI
Cream surfaces, dark navy text, deep coral primary actions, golden selected tabs and pilot. Fredoka display and Nunito body fonts are self-hosted. Compact floating controls, live selected-driver place/lap/speed, no dashboard sidebars. Position and lap numerals use light fill with dark outlines for readability against the scene. Race results use a quiet cream table with lap times, contacts and total duration. Demo remains labelled; no invented Jev performance claims.

## Responsive
At narrow widths the dock uses two rows, pilot selector remains above it, and the logo contracts to a flag. Results table scrolls horizontally. At desktop widths the controls occupy one centered row; the full scene remains the primary content.

## Verification scope
Source review checks camera state, accessibility, disposal and error handling. Browser checks cover desktop and mobile chase views, driver switching, camera modes, start/pause and results. Keep visual review bounded and fix concrete defects in batches.
