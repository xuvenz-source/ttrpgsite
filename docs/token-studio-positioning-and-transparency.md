# Token Studio portrait positioning and transparency (staged)

This update is included in the `feature/token-status-markers` batch, not production.

## Changes
- Portrait panning limits are derived from the displayed image dimensions and the frame opening, instead of the fixed ±180 shift units.
- Both drag-to-pan and scroll-to-zoom use these responsive limits.
- Maximum image zoom increased from 3× to 6×.
- Fine position sliders reflect each image's current horizontal and vertical range.
- A new **Background fill** selector offers Solid colour and Transparent — no background.
- Choosing Transparent skips the opaque canvas fill for both standard ring and custom-frame render paths. Export still uses WebP, which supports transparency.
- Existing colour settings remain available, and the transparent option can be toggled without losing the chosen colour.
- A custom uploaded frame's *own* embedded pixels remain unchanged.

## Release testing
- Import portrait with a face near a corner and zoom to 3–6×; drag face to centre.
- Validate portrait can pan further than previous 180-unit limit on both axes.
- Check scroll-to-zoom towards cursor after moving and at high magnification.
- Verify sliders cover the full new panning range and Centre resets offsets.
- For plain circle and custom frame, toggle solid/transparent and check checkerboard through transparent parts.
- Save token to personal library; reopen it on a character or NPC sheet and verify alpha survives.
- Verify exported token keeps transparent corners on a battlemap.
- Ensure portrait source remains unchanged and frame clipping remains correct.
